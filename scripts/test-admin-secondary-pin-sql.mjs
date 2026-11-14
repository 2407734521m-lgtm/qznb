import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

// Disposable local Postgres-compatible fixture; no project credentials or network.
// The extensions.crypt/gen_salt stubs below are deterministic test doubles only.
// Production uses the pgcrypto bcrypt implementation from Supabase's extensions schema.
const root = new URL('../', import.meta.url);
const db = new PGlite();
const adminId = '11111111-1111-4111-8111-111111111111';
const adminSessionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const adminSessionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secondAdminId = '33333333-3333-4333-8333-333333333333';
const secondAdminSession = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const memberId = '22222222-2222-4222-8222-222222222222';
const memberSession = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create schema extensions;
  create function extensions.gen_salt(text, integer) returns text
    language sql immutable as $$ select 'test-salt'::text $$;
  create function extensions.crypt(text, text) returns text
    language sql immutable as $$ select split_part($2, ':', 1) || ':' || $1 $$;

  create table auth.users(id uuid primary key);
  create table auth.sessions(
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade
  );
  insert into auth.users values
    ('${adminId}'), ('${secondAdminId}'), ('${memberId}');
  insert into auth.sessions values
    ('${adminSessionA}', '${adminId}'),
    ('${adminSessionB}', '${adminId}'),
    ('${secondAdminSession}', '${secondAdminId}'),
    ('${memberSession}', '${memberId}');

  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  create table public.profiles(id uuid primary key, role text not null);
  insert into public.profiles values
    ('${adminId}', 'super_admin'),
    ('${secondAdminId}', 'admin'),
    ('${memberId}', 'member');
  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.jwt(), auth.uid() to authenticated, service_role;
  grant select on public.profiles to authenticated, service_role;
`);

const historicalGate = 'supabase/migrations/20261114150000_admin_totp_mfa_gate.sql';
await db.exec(readFileSync(new URL(historicalGate, root), 'utf8'));
console.log(`PASS historical migration fixture: ${historicalGate}`);

const migration = 'supabase/migrations/20261115030500_admin_secondary_pin_gate.sql';
await db.exec(readFileSync(new URL(migration, root), 'utf8'));
console.log(`PASS ${migration}`);

await db.exec(`
  create function public.test_legacy_super_admin_gate() returns boolean
  language plpgsql security definer set search_path = '' as $function$
  begin
    if public.my_role() <> 'super_admin' then
      raise exception 'forbidden';
    end if;
    return true;
  end;
  $function$;
  grant execute on function public.test_legacy_super_admin_gate() to authenticated;
  set role authenticated;
`);

async function claimsFor(sub, sessionId, aal = 'aal1') {
  const claims = { sub, role: 'authenticated', session_id: sessionId, aal };
  await db.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify(claims),
  ]);
}

await claimsFor(adminId, adminSessionA);
let result = await db.query(`
  select public.my_role() as role,
         public.admin_login_is_admin() as is_admin,
         public.admin_secondary_password_status() as configured
`);
assert.equal(result.rows[0].role, 'member', 'admin without PIN verification must be downgraded');
assert.equal(result.rows[0].is_admin, true, 'login may identify the caller as an admin');
assert.equal(result.rows[0].configured, false, 'first login must be prompted to set a PIN');
console.log('PASS admin role remains restricted before PIN verification');

result = await db.query("select public.admin_set_secondary_password('482916') as created");
assert.equal(result.rows[0].created, true, 'admin can set an initial PIN once');
result = await db.query("select public.admin_set_secondary_password('739204') as created");
assert.equal(result.rows[0].created, false, 'initial PIN cannot be overwritten via setup RPC');

result = await db.query("select public.admin_verify_secondary_password('000000') as verified");
assert.equal(result.rows[0].verified, false, 'incorrect PIN must fail');
result = await db.query("select public.admin_verify_secondary_password('482916') as verified");
assert.equal(result.rows[0].verified, true, 'correct PIN must verify the current session');

result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'super_admin', 'verified PIN session gets the admin role');
result = await db.query('select public.test_legacy_super_admin_gate() as allowed');
assert.equal(result.rows[0].allowed, true, 'legacy my_role()-based gates continue to work');
console.log('PASS successful PIN verification unlocks the current session and existing role gates');

await claimsFor(adminId, adminSessionB);
result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'member', 'another session for the same admin must remain locked');
result = await db.query("select public.admin_verify_secondary_password('482916') as verified");
assert.equal(result.rows[0].verified, true, 'a second device can independently verify its own session');
result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'super_admin', 'second device gets its own grant only after PIN verification');
console.log('PASS PIN verification is scoped to each Supabase session');

await claimsFor(adminId, adminSessionA);
result = await db.query("select public.admin_change_secondary_password('482916', '739204') as changed");
assert.equal(result.rows[0].changed, true, 'current PIN can be rotated after verification');
result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'super_admin', 'current session remains authorized after rotation');
await claimsFor(adminId, adminSessionB);
result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'member', 'changing the PIN must revoke other devices’ prior admin grants');
result = await db.query("select public.admin_verify_secondary_password('482916') as verified");
assert.equal(result.rows[0].verified, false, 'the previous PIN must stop working after rotation');
result = await db.query("select public.admin_verify_secondary_password('739204') as verified");
assert.equal(result.rows[0].verified, true, 'the new PIN must verify');
console.log('PASS PIN rotation invalidates the old PIN and revokes other sessions');

await claimsFor(secondAdminId, secondAdminSession);
result = await db.query("select public.admin_set_secondary_password('384920') as created");
assert.equal(result.rows[0].created, true);
for (let attempt = 0; attempt < 5; attempt += 1) {
  result = await db.query("select public.admin_verify_secondary_password('000000') as verified");
  assert.equal(result.rows[0].verified, false, 'wrong PIN attempts must fail');
}
result = await db.query("select public.admin_verify_secondary_password('384920') as verified");
assert.equal(result.rows[0].verified, false, 'correct PIN must be rejected while the account is locked');
result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'member', 'locked account must not receive admin role');
console.log('PASS five failed attempts trigger a 15-minute account lock');

await claimsFor(memberId, memberSession);
result = await db.query(`
  select public.my_role() as role,
         public.admin_login_is_admin() as is_admin,
         public.admin_secondary_password_status() as configured
`);
assert.equal(result.rows[0].role, 'member', 'ordinary member role remains unchanged');
assert.equal(result.rows[0].is_admin, false, 'ordinary member cannot pass the admin identity check');
assert.equal(result.rows[0].configured, false);
result = await db.query("select public.admin_set_secondary_password('482916') as created");
assert.equal(result.rows[0].created, false, 'ordinary members cannot set an admin PIN');
console.log('PASS ordinary member cannot configure or obtain admin access');

await claimsFor(undefined, undefined);
result = await db.query(`
  select public.my_role() as role,
         public.admin_login_is_admin() as is_admin,
         public.admin_secondary_password_status() as configured
`);
assert.equal(result.rows[0].role, null, 'anonymous caller has no role');
assert.equal(result.rows[0].is_admin, false, 'anonymous caller is not an admin');
assert.equal(result.rows[0].configured, false);
console.log('PASS anonymous caller is denied');

await db.close();
