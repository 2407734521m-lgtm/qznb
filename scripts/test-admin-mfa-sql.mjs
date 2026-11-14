import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

// Disposable local Postgres-compatible fixture; no project credentials or network.
const root = new URL('../', import.meta.url);
const db = new PGlite();
const adminId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  create table public.profiles(id uuid primary key, role text not null);
  insert into public.profiles values
    ('${adminId}', 'super_admin'),
    ('${memberId}', 'member');
  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.jwt(), auth.uid() to authenticated, service_role;
  grant select on public.profiles to authenticated, service_role;
`);

const migration = 'supabase/migrations/20261114150000_admin_totp_mfa_gate.sql';
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

async function claimsFor(sub, aal) {
  const claims = { sub, role: 'authenticated', ...(aal ? { aal } : {}) };
  await db.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify(claims)]);
}

await claimsFor(adminId, 'aal1');
let result = await db.query('select public.my_role() as role, public.admin_login_is_admin() as is_admin');
assert.equal(result.rows[0].role, 'member', 'aal1 admin must be downgraded to member');
assert.equal(result.rows[0].is_admin, true, 'admin login may identify the caller’s own admin account');
await assert.rejects(
  db.query('select public.test_legacy_super_admin_gate()'),
  /forbidden/,
  'the non-NULL downgraded role must close legacy <> checks'
);
console.log('PASS aal1 admin is denied by my_role() and legacy <> checks');

await db.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify({
  sub: adminId,
  role: 'authenticated',
  aal: 'aal2',
  amr: [{ method: 'password' }, { method: 'phone' }],
})]);
result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'member', 'aal2 without a TOTP method must remain downgraded');
console.log('PASS aal2 without TOTP AMR is denied');

await db.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify({
  sub: adminId,
  role: 'authenticated',
  aal: 'aal2',
  amr: [{ method: 'password' }, { method: 'mfa/recovery_code' }],
})]);
result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'member', 'recovery-code-only session must not grant admin access');
console.log('PASS recovery-code AMR alone is denied');

await claimsFor(adminId, undefined);
result = await db.query('select public.my_role() as role');
assert.equal(result.rows[0].role, 'member', 'missing aal claim must fail closed');
console.log('PASS missing aal claim fails closed');

await db.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify({
  sub: adminId,
  role: 'authenticated',
  aal: 'aal2',
  amr: [{ method: 'password' }, { method: 'totp' }],
})]);
result = await db.query('select public.my_role() as role, public.admin_login_is_admin() as is_admin');
assert.equal(result.rows[0].role, 'super_admin', 'aal2 TOTP admin keeps its role');
assert.equal(result.rows[0].is_admin, true);
console.log('PASS aal2 TOTP admin retains the super_admin role');

await claimsFor(memberId, 'aal1');
result = await db.query('select public.my_role() as role, public.admin_login_is_admin() as is_admin');
assert.equal(result.rows[0].role, 'member', 'ordinary member role remains unchanged');
assert.equal(result.rows[0].is_admin, false, 'ordinary member cannot pass admin login identity check');
console.log('PASS ordinary member role is unchanged');

await claimsFor(undefined, undefined);
result = await db.query('select public.my_role() as role, public.admin_login_is_admin() as is_admin');
assert.equal(result.rows[0].role, null, 'anonymous caller has no role');
assert.equal(result.rows[0].is_admin, false, 'anonymous caller is not an admin');
console.log('PASS anonymous caller is denied');

await db.close();
