-- Pair-specific login budgets avoid letting one IP lock out another IP.
-- Deliberately no global username ceiling: it would reintroduce account lockout.
begin;

create table login_private.username_login_ip_attempts (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts between 0 and 61)
);
alter table login_private.username_login_ip_attempts enable row level security;
revoke all on table login_private.username_login_ip_attempts from public, anon, authenticated;
grant select, insert, update, delete on table login_private.username_login_ip_attempts to service_role;

-- The existing table now stores hashes of (IP, username), not username hashes.
-- Preserve its shape so admin_security_overview still reports pair limits (>8).
create index username_login_attempts_window_idx
  on login_private.username_login_attempts (window_started_at);
create index username_login_ip_attempts_window_idx
  on login_private.username_login_ip_attempts (window_started_at);

-- Retire the username-only RPC. Old function deployments fail closed until
-- redeployed, instead of silently continuing to enforce the vulnerable limit.
drop function public.consume_username_login_attempt(text);

create function public.consume_username_login_attempt(p_ip_hash text, p_identifier_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_ip_attempts integer;
  v_pair_attempts integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_identifier_hash is null or p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid identifier hash' using errcode = '22023';
  end if;

  -- Bounded retention, including rows created by unknown-username attempts.
  delete from login_private.username_login_ip_attempts
    where window_started_at < now() - interval '24 hours';
  delete from login_private.username_login_attempts
    where window_started_at < now() - interval '24 hours';

  -- Atomic UPSERTs serialize parallel attempts. Always acquire IP before pair.
  insert into login_private.username_login_ip_attempts as a (ip_hash, window_started_at, attempts)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
  set window_started_at = case when a.window_started_at <= now() - interval '15 minutes'
        then now() else a.window_started_at end,
      attempts = case when a.window_started_at <= now() - interval '15 minutes'
        then 1 else least(a.attempts + 1, 61) end
  returning attempts into v_ip_attempts;

  -- 60 total attempts/IP/15 min, including successes. Do not allocate any more
  -- pair rows once an IP has exhausted its global budget.
  if v_ip_attempts > 60 then return false; end if;

  insert into login_private.username_login_attempts as a (identifier_hash, window_started_at, attempts)
  values (p_identifier_hash, now(), 1)
  on conflict (identifier_hash) do update
  set window_started_at = case when a.window_started_at <= now() - interval '15 minutes'
        then now() else a.window_started_at end,
      attempts = case when a.window_started_at <= now() - interval '15 minutes'
        then 1 else least(a.attempts + 1, 9) end
  returning attempts into v_pair_attempts;

  return v_pair_attempts <= 8;
end;
$fn$;

-- Service role already has private-schema/table privileges. These exposed RPCs
-- are SECURITY INVOKER, not exposed SECURITY DEFINER entry points.
create or replace function public.clear_username_login_attempts(p_identifier_hash text)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if p_identifier_hash is null or p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid identifier hash' using errcode = '22023';
  end if;
  delete from login_private.username_login_attempts where identifier_hash = p_identifier_hash;
end;
$fn$;

revoke all on function public.consume_username_login_attempt(text, text) from public, anon, authenticated;
revoke all on function public.clear_username_login_attempts(text) from public, anon, authenticated;
grant execute on function public.consume_username_login_attempt(text, text) to service_role;
grant execute on function public.clear_username_login_attempts(text) to service_role;

commit;
