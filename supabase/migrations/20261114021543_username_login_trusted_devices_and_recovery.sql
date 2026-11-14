-- Trusted devices are a possession factor, NOT a passwordless credential.
begin;
alter table login_private.username_login_accounts
  add column trusted_device boolean not null default false;

create table login_private.username_login_devices (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  credential_fingerprint text not null,
  revoked_at timestamptz
);
create index username_login_devices_user_idx on login_private.username_login_devices(user_id, issued_at desc);
alter table login_private.username_login_devices enable row level security;
revoke all on login_private.username_login_devices from public, anon, authenticated;
grant select, insert, update, delete on login_private.username_login_devices to service_role;

create function login_private.reserve_login_budget(p_username_hash text, p_limit integer, p_after integer, p_cap integer, p_trusted boolean)
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
  if a.failures >= p_limit then
    v_retry := ceil(extract(epoch from (a.window_started_at + interval '1 hour' - v_now)) * 1000)::integer;
  else
    v_retry := ceil(extract(epoch from (greatest(a.next_allowed_at, coalesce(a.reserved_until, v_now)) - v_now)) * 1000)::integer;
  end if;
  if v_retry > 0 then
    return jsonb_build_object('allowed', false, 'retry_after_ms', v_retry);
  end if;

  a.failures := a.failures + 1; -- failed OR pending; verified success resets this account
  v_delay := case when a.failures < p_after then 0 else least(p_cap, power(2, least(a.failures - p_after, 6))::integer) end;
  v_token := gen_random_uuid();
  update login_private.username_login_accounts
  set window_started_at = a.window_started_at, failures = a.failures, trusted_device = p_trusted,
      reservation_token = v_token, reserved_until = v_now + interval '30 seconds',
      next_allowed_at = v_now + make_interval(secs => greatest(30, v_delay))
  where username_hash = p_username_hash;
  return jsonb_build_object('allowed', true, 'token', v_token);
end;
$fn$;

create or replace function public.begin_username_login_attempt(p_username_hash text)
returns jsonb language sql security invoker set search_path = '' as $fn$
  select login_private.reserve_login_budget(p_username_hash, 30, 5, 60, false);
$fn$;

-- Narrow privileged helper in the unexposed private schema; do not grant the
-- service role direct access to Auth password hashes or expose a definer RPC.
create function login_private.device_credential_fingerprint(p_user_id uuid)
returns text language sql stable security definer set search_path='' as $fn$
  select encode(sha256(convert_to(encrypted_password,'UTF8')),'hex')
  from auth.users where id=p_user_id and coalesce(encrypted_password,'')<>''
    and deleted_at is null and (banned_until is null or banned_until<=statement_timestamp());
$fn$;
revoke all on function login_private.device_credential_fingerprint(uuid) from public,anon,authenticated;
grant execute on function login_private.device_credential_fingerprint(uuid) to service_role;

create function public.is_username_login_device(p_token_hash text, p_username text)
returns boolean language sql security invoker set search_path = '' as $fn$
  select exists(select 1 from login_private.username_login_devices d
    join public.profiles p on p.id = d.user_id
    where d.token_hash = p_token_hash and p.username = p_username
      and d.credential_fingerprint = login_private.device_credential_fingerprint(d.user_id)
      and d.revoked_at is null and d.expires_at > clock_timestamp());
$fn$;

create function public.begin_trusted_username_login_attempt(p_token_hash text, p_username text)
returns jsonb language plpgsql security invoker set search_path = '' as $fn$
begin
  perform 1 from login_private.username_login_devices where token_hash = p_token_hash for update;
  if not public.is_username_login_device(p_token_hash, p_username) then
    return jsonb_build_object('trusted', false);
  end if;
  return login_private.reserve_login_budget(p_token_hash, 10, 3, 15, true)
    || jsonb_build_object('trusted', true);
end;
$fn$;

create or replace function public.finish_username_login_attempt(p_username_hash text, p_token uuid, p_success boolean)
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
    v_delay := case when a.trusted_device then
      case when a.failures < 3 then 0 else least(15, power(2, least(a.failures - 3, 4))::integer) end
      else case when a.failures < 5 then 0 else least(60, power(2, least(a.failures - 5, 6))::integer) end end;
    update login_private.username_login_accounts
      set next_allowed_at = clock_timestamp() + make_interval(secs => v_delay),
          reservation_token = null, reserved_until = null
      where username_hash = p_username_hash;
  end if;
  return true;
end;
$fn$;

create function public.register_username_login_device(p_user_id uuid, p_token_hash text)
returns void language plpgsql security invoker set search_path = '' as $fn$
declare v_fingerprint text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device hash' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 231));
  v_fingerprint:=login_private.device_credential_fingerprint(p_user_id);
  if v_fingerprint is null then
    raise exception 'password account required' using errcode='22023';
  end if;
  delete from login_private.username_login_devices where revoked_at is not null or expires_at < clock_timestamp();
  insert into login_private.username_login_devices(user_id, token_hash, credential_fingerprint)
    values(p_user_id,p_token_hash,v_fingerprint);
  -- At most five active devices; never store the raw bearer secret.
  update login_private.username_login_devices set revoked_at = clock_timestamp()
    where token_hash in (select token_hash from login_private.username_login_devices
      where user_id = p_user_id and revoked_at is null and expires_at > clock_timestamp()
      order by issued_at desc, token_hash desc offset 5);
end;
$fn$;

create function public.revoke_username_login_device(p_token_hash text)
returns void language plpgsql security invoker set search_path = '' as $fn$
begin
  update login_private.username_login_devices set revoked_at = clock_timestamp()
    where token_hash = p_token_hash and revoked_at is null;
  delete from login_private.username_login_accounts where username_hash = p_token_hash and trusted_device;
end;
$fn$;

create table login_private.username_login_recovery (
  scope text not null check (scope in ('ip', 'username', 'recipient', 'global_hour', 'global_day')),
  identifier_hash text not null check (identifier_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_sent_at timestamptz,
  primary key(scope, identifier_hash)
);
create index username_login_recovery_window_idx on login_private.username_login_recovery(window_started_at);
alter table login_private.username_login_recovery enable row level security;
revoke all on login_private.username_login_recovery from public, anon, authenticated;
grant select, insert, update, delete on login_private.username_login_recovery to service_role;

create function public.consume_username_login_recovery(p_username_hash text, p_ip_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $fn$
declare
  a login_private.username_login_recovery%rowtype;
  n integer;
  t timestamptz := clock_timestamp();
begin
  if p_username_hash is null or p_username_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid recovery hash' using errcode = '22023';
  end if;
  delete from login_private.username_login_recovery where window_started_at < t - interval '2 days';
  insert into login_private.username_login_recovery as r (scope, identifier_hash, attempts)
    values ('ip', p_ip_hash, 1) on conflict (scope, identifier_hash) do update
    set window_started_at = case when r.window_started_at <= t - interval '1 hour' then t else r.window_started_at end,
        attempts = case when r.window_started_at <= t - interval '1 hour' then 1 else least(r.attempts + 1, 6) end
    returning attempts into n;
  if n > 5 then return false; end if;
  insert into login_private.username_login_recovery(scope, identifier_hash) values ('username', p_username_hash)
    on conflict (scope, identifier_hash) do nothing;
  select * into a from login_private.username_login_recovery
    where scope = 'username' and identifier_hash = p_username_hash for update;
  if a.window_started_at <= t - interval '24 hours' then
    a.window_started_at := t; a.attempts := 0; a.last_sent_at := null;
  end if;
  if a.attempts >= 3 or a.last_sent_at > t - interval '10 minutes' then return false; end if;
  update login_private.username_login_recovery set window_started_at = a.window_started_at,
    attempts = a.attempts + 1, last_sent_at = t
    where scope = 'username' and identifier_hash = p_username_hash;
  return true;
end;
$fn$;

revoke all on function login_private.reserve_login_budget(text, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function login_private.reserve_login_budget(text, integer, integer, integer, boolean) to service_role;
revoke all on function public.is_username_login_device(text, text) from public, anon, authenticated;
revoke all on function public.begin_trusted_username_login_attempt(text, text) from public, anon, authenticated;
revoke all on function public.register_username_login_device(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_username_login_device(text) from public, anon, authenticated;
revoke all on function public.consume_username_login_recovery(text, text) from public, anon, authenticated;
grant execute on function public.is_username_login_device(text, text) to service_role;
grant execute on function public.begin_trusted_username_login_attempt(text, text) to service_role;
grant execute on function public.register_username_login_device(uuid, text) to service_role;
grant execute on function public.revoke_username_login_device(text) to service_role;
grant execute on function public.consume_username_login_recovery(text, text) to service_role;

-- Recipient identity prevents renamed usernames from resetting email quotas.
create function public.consume_username_login_recovery_recipient(p_email_hash text)
returns boolean language plpgsql security invoker set search_path='' as $fn$
declare a login_private.username_login_recovery%rowtype; t timestamptz; n integer;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid recipient hash' using errcode='22023';
  end if;
  insert into login_private.username_login_recovery(scope, identifier_hash)
    values('recipient',p_email_hash) on conflict do nothing;
  select * into a from login_private.username_login_recovery
    where scope='recipient' and identifier_hash=p_email_hash for update;
  t:=clock_timestamp();
  if a.window_started_at <= t-interval '24 hours' then
    a.window_started_at:=t; a.attempts:=0; a.last_sent_at:=null;
  end if;
  if a.attempts>=3 or a.last_sent_at>t-interval '10 minutes' then return false; end if;
  -- Charge project budgets only after mailbox eligibility and recipient quota.
  -- Random unknown-username floods must not exhaust every real user's mail quota.
  insert into login_private.username_login_recovery as r(scope, identifier_hash, attempts)
    values ('global_day', repeat('0',64), 1) on conflict (scope, identifier_hash) do update
    set window_started_at=case when r.window_started_at <= t-interval '1 day' then t else r.window_started_at end,
        attempts=case when r.window_started_at <= t-interval '1 day' then 1 else least(r.attempts+1,101) end
    returning attempts into n;
  if n>100 then return false; end if;
  insert into login_private.username_login_recovery as r(scope, identifier_hash, attempts)
    values ('global_hour', repeat('0',64), 1) on conflict (scope, identifier_hash) do update
    set window_started_at=case when r.window_started_at <= t-interval '1 hour' then t else r.window_started_at end,
        attempts=case when r.window_started_at <= t-interval '1 hour' then 1 else least(r.attempts+1,21) end
    returning attempts into n;
  if n>20 then return false; end if;
  update login_private.username_login_recovery set window_started_at=a.window_started_at,
    attempts=a.attempts+1,last_sent_at=t where scope='recipient' and identifier_hash=p_email_hash;
  return true;
end;
$fn$;
create function public.revoke_all_username_login_devices(p_user_id uuid)
returns void language sql security invoker set search_path='' as $fn$
  update login_private.username_login_devices set revoked_at=clock_timestamp()
    where user_id=p_user_id and revoked_at is null;
$fn$;
revoke all on function public.consume_username_login_recovery_recipient(text) from public,anon,authenticated;
revoke all on function public.revoke_all_username_login_devices(uuid) from public,anon,authenticated;
grant execute on function public.consume_username_login_recovery_recipient(text) to service_role;
grant execute on function public.revoke_all_username_login_devices(uuid) to service_role;

commit;
