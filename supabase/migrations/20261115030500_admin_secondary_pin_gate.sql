-- Replace the legacy authenticator gate with a per-admin six-digit secondary password.
-- Authorization remains server-side: a successful PIN check marks only the current
-- Supabase session as verified for up to eight hours. All existing my_role()-based
-- RLS policies and admin RPC guards continue to enforce the gate.
begin;

-- Supabase production already has pgcrypto installed in the extensions schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_secondary_passwords (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  window_started_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz
);

create table if not exists private.admin_secondary_verified_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, session_id)
);

create index if not exists admin_secondary_verified_sessions_expiry_idx
  on private.admin_secondary_verified_sessions (expires_at);

alter table private.admin_secondary_passwords enable row level security;
alter table private.admin_secondary_verified_sessions enable row level security;
revoke all on table private.admin_secondary_passwords from public, anon, authenticated;
revoke all on table private.admin_secondary_verified_sessions from public, anon, authenticated;

create or replace function public.admin_secondary_password_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select p.role in ('admin', 'super_admin')
      and exists (
        select 1
        from private.admin_secondary_passwords s
        where s.user_id = p.id
      )
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$function$;

create or replace function public.admin_set_secondary_password(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null or not public.admin_login_is_admin() then
    return false;
  end if;

  if p_pin is null
    or p_pin !~ '^[0-9]{6}$'
    or p_pin ~ '^([0-9])\1{5}$'
    or p_pin in ('012345', '123456', '234567', '345678', '456789',
                 '987654', '876543', '765432', '654321', '543210') then
    return false;
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_session_id is null or not exists (
    select 1 from auth.sessions s
    where s.id = v_session_id and s.user_id = v_user_id
  ) then
    return false;
  end if;

  insert into private.admin_secondary_passwords (user_id, pin_hash)
  values (v_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)))
  on conflict (user_id) do nothing;

  return found;
end;
$function$;

create or replace function public.admin_verify_secondary_password(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_pin_hash text;
  v_attempts integer;
  v_window_started_at timestamptz;
  v_locked_until timestamptz;
begin
  if v_user_id is null or not public.admin_login_is_admin()
    or p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return false;
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_session_id is null or not exists (
    select 1 from auth.sessions s
    where s.id = v_session_id and s.user_id = v_user_id
  ) then
    return false;
  end if;

  select s.pin_hash, s.failed_attempts, s.window_started_at, s.locked_until
    into v_pin_hash, v_attempts, v_window_started_at, v_locked_until
  from private.admin_secondary_passwords s
  where s.user_id = v_user_id
  for update;

  if not found then
    return false;
  end if;

  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;

  if v_window_started_at is null
    or v_window_started_at <= now() - interval '15 minutes' then
    v_attempts := 0;
    v_window_started_at := now();
  end if;

  if extensions.crypt(p_pin, v_pin_hash) = v_pin_hash then
    update private.admin_secondary_passwords
    set failed_attempts = 0,
        window_started_at = null,
        locked_until = null,
        last_success_at = now(),
        updated_at = now()
    where user_id = v_user_id;

    delete from private.admin_secondary_verified_sessions
    where user_id = v_user_id and expires_at <= now();

    insert into private.admin_secondary_verified_sessions
      (user_id, session_id, verified_at, expires_at)
    values
      (v_user_id, v_session_id, now(), now() + interval '8 hours')
    on conflict (user_id, session_id) do update
      set verified_at = excluded.verified_at,
          expires_at = excluded.expires_at;

    return true;
  end if;

  v_attempts := v_attempts + 1;
  update private.admin_secondary_passwords
  set failed_attempts = v_attempts,
      window_started_at = v_window_started_at,
      locked_until = case
        when v_attempts >= 5 then now() + interval '15 minutes'
        else null
      end,
      updated_at = now()
  where user_id = v_user_id;

  return false;
end;
$function$;

create or replace function public.admin_change_secondary_password(
  p_current_pin text,
  p_new_pin text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_id uuid;
begin
  if p_new_pin is null
    or p_new_pin !~ '^[0-9]{6}$'
    or p_new_pin ~ '^([0-9])\1{5}$'
    or p_new_pin in ('012345', '123456', '234567', '345678', '456789',
                     '987654', '876543', '765432', '654321', '543210') then
    return false;
  end if;

  if not public.admin_verify_secondary_password(p_current_pin) then
    return false;
  end if;

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  update private.admin_secondary_passwords
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 12)),
      failed_attempts = 0,
      window_started_at = null,
      locked_until = null,
      updated_at = now()
  where user_id = auth.uid();

  if not found then
    return false;
  end if;

  -- Rotate the PIN and revoke every other session's previously granted admin access.
  delete from private.admin_secondary_verified_sessions
  where user_id = auth.uid()
    and session_id <> v_session_id;

  return true;
end;
$function$;

-- A verified PIN unlocks only the session that supplied it. The current live
-- Auth session is checked too, so signed-out/revoked sessions cannot retain admin access.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p.role in ('admin', 'super_admin')
      and not exists (
        select 1
        from private.admin_secondary_verified_sessions v
        join auth.sessions live
          on live.id = v.session_id
         and live.user_id = v.user_id
        where v.user_id = auth.uid()
          and v.session_id::text = coalesce(auth.jwt() ->> 'session_id', '')
          and v.expires_at > now()
      )
      then 'member'
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid();
$function$;

revoke all on function public.admin_secondary_password_status() from public, anon;
revoke all on function public.admin_set_secondary_password(text) from public, anon;
revoke all on function public.admin_verify_secondary_password(text) from public, anon;
revoke all on function public.admin_change_secondary_password(text, text) from public, anon;
grant execute on function public.admin_secondary_password_status() to authenticated;
grant execute on function public.admin_set_secondary_password(text) to authenticated;
grant execute on function public.admin_verify_secondary_password(text) to authenticated;
grant execute on function public.admin_change_secondary_password(text, text) to authenticated;

revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated, service_role;

commit;
