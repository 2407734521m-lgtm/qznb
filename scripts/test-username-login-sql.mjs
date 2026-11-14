import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
// Minimal disposable Auth/profile fixture; no network or production credentials.
const root = new URL('../', import.meta.url);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; grant usage on schema auth to service_role;
create table auth.users(id uuid primary key, encrypted_password text, deleted_at timestamptz, banned_until timestamptz);
create table public.profiles(id uuid primary key, username text unique);
grant select on public.profiles to service_role;
create function public.resolve_login_email(text) returns text language sql as $$select null::text$$;`);
for (const path of [
  'supabase/migrations/20261031104452_026_secure_username_login.sql',
  'supabase/migrations/20261107031551_fix_username_login_rate_limit.sql',
  'supabase/migrations/20261107034642_add_username_login_account_backoff.sql',
  'supabase/migrations/20261114021543_username_login_trusted_devices_and_recovery.sql',
  'supabase/tests/username_login_rate_limit.sql',
  'supabase/tests/username_login_account_backoff.sql',
  'supabase/tests/username_login_devices_recovery.sql',
]) {
  await db.exec(readFileSync(new URL(path, root), 'utf8'));
  console.log('PASS ' + path);
}
console.log('PostgreSQL: ' + (await db.query('select version()')).rows[0].version);
await db.close();
