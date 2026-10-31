-- 026: Move username-to-email resolution out of the public browser RPC.
-- Username login is now handled by the username-login Edge Function. It only
-- returns an Auth session after a successful password check; the email address
-- is never returned to an unauthenticated browser.

create schema if not exists login_private;
revoke all on schema login_private from public, anon, authenticated;
grant usage on schema login_private to service_role;

create table if not exists login_private.username_login_attempts (
  identifier_hash text primary key
    check (identifier_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table login_private.username_login_attempts enable row level security;
revoke all on table login_private.username_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on table login_private.username_login_attempts to service_role;

create or replace function public.consume_username_login_attempt(p_identifier_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, login_private
as $fn$
declare
  v_attempts integer;
begin
  if p_identifier_hash is null or p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid identifier hash' using errcode = '22023';
  end if;

  insert into login_private.username_login_attempts(identifier_hash, window_started_at, attempts)
  values (p_identifier_hash, now(), 1)
  on conflict (identifier_hash) do update
  set window_started_at = case
        when login_private.username_login_attempts.window_started_at <= now() - interval '15 minutes'
          then now()
        else login_private.username_login_attempts.window_started_at
      end,
      attempts = case
        when login_private.username_login_attempts.window_started_at <= now() - interval '15 minutes'
          then 1
        else login_private.username_login_attempts.attempts + 1
      end
  returning attempts into v_attempts;

  return v_attempts <= 8;
end;
$fn$;

create or replace function public.clear_username_login_attempts(p_identifier_hash text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, login_private
as $fn$
begin
  if p_identifier_hash is null or p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid identifier hash' using errcode = '22023';
  end if;
  delete from login_private.username_login_attempts
  where identifier_hash = p_identifier_hash;
end;
$fn$;

revoke all on function public.consume_username_login_attempt(text) from public, anon, authenticated;
revoke all on function public.clear_username_login_attempts(text) from public, anon, authenticated;
grant execute on function public.consume_username_login_attempt(text) to service_role;
grant execute on function public.clear_username_login_attempts(text) to service_role;

-- The old function disclosed the matching email before a password was checked.
-- Keep the function definition for rollback diagnostics, but remove browser access.
revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
