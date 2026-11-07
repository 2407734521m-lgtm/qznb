-- IP-independent safety net. Forwarded IP headers are only extra defense.
begin;

create table login_private.username_login_accounts (
  username_hash text primary key check (username_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  failures integer not null default 0 check (failures between 0 and 30),
  next_allowed_at timestamptz not null default now(),
  reservation_token uuid,
  reserved_until timestamptz
);
alter table login_private.username_login_accounts enable row level security;
revoke all on table login_private.username_login_accounts from public, anon, authenticated;
grant select, insert, update, delete on table login_private.username_login_accounts to service_role;
create index username_login_accounts_window_idx
  on login_private.username_login_accounts (window_started_at);

-- Reserve BEFORE Auth, not after it: parallel requests or aborted clients must
-- not run unlimited password checks while failure recording is still in flight.
create function public.begin_username_login_attempt(p_username_hash text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  a login_private.username_login_accounts%rowtype;
  v_now timestamptz;
  v_retry integer;
  v_delay integer;
  v_token uuid;
begin
  if p_username_hash is null or p_username_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid username hash' using errcode = '22023';
  end if;
  delete from login_private.username_login_accounts
    where window_started_at < clock_timestamp() - interval '24 hours';
  insert into login_private.username_login_accounts (username_hash)
    values (p_username_hash) on conflict (username_hash) do nothing;
  select * into a from login_private.username_login_accounts
    where username_hash = p_username_hash for update;
  v_now := clock_timestamp();

  -- Fixed hour; rejected attempts never slide/extend the victim's window.
  if a.window_started_at <= v_now - interval '1 hour' then
    a.window_started_at := v_now;
    a.failures := 0;
    a.next_allowed_at := v_now;
    a.reservation_token := null;
    a.reserved_until := null;
  end if;
  if a.failures >= 30 then
    v_retry := ceil(extract(epoch from (a.window_started_at + interval '1 hour' - v_now)) * 1000)::integer;
  else
    v_retry := ceil(extract(epoch from (greatest(a.next_allowed_at, coalesce(a.reserved_until, v_now)) - v_now)) * 1000)::integer;
  end if;
  if v_retry > 0 then
    return jsonb_build_object('allowed', false, 'retry_after_ms', v_retry);
  end if;

  a.failures := a.failures + 1; -- failed OR pending; verified success resets this account
  v_delay := case when a.failures < 5 then 0 else least(60, power(2, least(a.failures - 5, 6))::integer) end;
  v_token := gen_random_uuid();
  update login_private.username_login_accounts
  set window_started_at = a.window_started_at, failures = a.failures,
      reservation_token = v_token, reserved_until = v_now + interval '30 seconds',
      next_allowed_at = v_now + make_interval(secs => greatest(30, v_delay))
  where username_hash = p_username_hash;
  return jsonb_build_object('allowed', true, 'token', v_token);
end;
$fn$;

create function public.finish_username_login_attempt(p_username_hash text, p_token uuid, p_success boolean)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  a login_private.username_login_accounts%rowtype;
  v_delay integer;
begin
  if p_username_hash is null or p_username_hash !~ '^[0-9a-f]{64}$'
    or p_token is null or p_success is null then
    raise exception 'invalid attempt completion' using errcode = '22023';
  end if;
  select * into a from login_private.username_login_accounts
    where username_hash = p_username_hash for update;
  -- An old/duplicate completion must never clear a newer attempt or backoff.
  if not found or a.reservation_token is distinct from p_token then return false; end if;
  if p_success then
    delete from login_private.username_login_accounts where username_hash = p_username_hash;
  else
    v_delay := case when a.failures < 5 then 0 else least(60, power(2, least(a.failures - 5, 6))::integer) end;
    update login_private.username_login_accounts
      set next_allowed_at = clock_timestamp() + make_interval(secs => v_delay),
          reservation_token = null, reserved_until = null
      where username_hash = p_username_hash;
  end if;
  return true;
end;
$fn$;

revoke all on function public.begin_username_login_attempt(text) from public, anon, authenticated;
revoke all on function public.finish_username_login_attempt(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.begin_username_login_attempt(text) to service_role;
grant execute on function public.finish_username_login_attempt(text, uuid, boolean) to service_role;
commit;
