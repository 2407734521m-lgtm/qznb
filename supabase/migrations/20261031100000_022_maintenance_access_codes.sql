-- 022: 六位数临时维护通行码
-- 通行码与管理员认证完全分离；只授予临时绕过维护页的能力。
-- 敏感表与 SECURITY DEFINER 实现放在非 Data API 暴露的私有 schema；
-- public RPC 仅使用 SECURITY INVOKER 包装。

create schema if not exists maintenance_private;
revoke all on schema maintenance_private from public;
grant usage on schema maintenance_private to anon, authenticated;

create extension if not exists pgcrypto with schema extensions;

create table maintenance_private.access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses between 1 and 100),
  used_count integer not null default 0 check (used_count >= 0),
  revoked_at timestamptz
);

create table maintenance_private.access_sessions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references maintenance_private.access_codes(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table maintenance_private.access_attempts (
  client_ip inet not null,
  attempted_at timestamptz not null default now()
);
create index maintenance_access_attempts_ip_time_idx
  on maintenance_private.access_attempts (client_ip, attempted_at desc);
create index maintenance_access_sessions_code_idx
  on maintenance_private.access_sessions (code_id);

alter table maintenance_private.access_codes enable row level security;
alter table maintenance_private.access_sessions enable row level security;
alter table maintenance_private.access_attempts enable row level security;
revoke all on all tables in schema maintenance_private from public, anon, authenticated;

create or replace function maintenance_private.admin_create_maintenance_code(
  p_valid_minutes integer default 15,
  p_max_uses integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, maintenance_private, extensions
as $fn$
declare
  v_code text;
  v_bytes bytea;
  v_expires timestamptz;
  v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception '管理员权限不足' using errcode = '42501';
  end if;
  if p_valid_minutes not between 5 and 1440 or p_max_uses not between 1 and 100 then
    raise exception '有效期或使用次数超出允许范围' using errcode = '22023';
  end if;

  update maintenance_private.access_codes set revoked_at = now() where revoked_at is null;
  update maintenance_private.access_sessions set revoked_at = now() where revoked_at is null;

  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_code := lpad((
      (get_byte(v_bytes, 0)::bigint * 16777216
       + get_byte(v_bytes, 1)::bigint * 65536
       + get_byte(v_bytes, 2)::bigint * 256
       + get_byte(v_bytes, 3)::bigint) % 1000000
    )::text, 6, '0');
    exit when not exists (
      select 1 from maintenance_private.access_codes
      where code_hash = encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex')
    );
  end loop;

  v_expires := now() + make_interval(mins => p_valid_minutes);
  insert into maintenance_private.access_codes(code_hash, created_by, expires_at, max_uses)
  values (encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'), v_uid, v_expires, p_max_uses);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires, 'max_uses', p_max_uses);
end;
$fn$;

create or replace function maintenance_private.admin_revoke_maintenance_codes()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, maintenance_private
as $fn$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception '管理员权限不足' using errcode = '42501';
  end if;
  update maintenance_private.access_codes set revoked_at = now()
    where revoked_at is null and expires_at > now();
  get diagnostics v_count = row_count;
  update maintenance_private.access_sessions s set revoked_at = now()
    from maintenance_private.access_codes c
    where s.code_id = c.id and s.revoked_at is null;
  return jsonb_build_object('ok', true, 'revoked_count', v_count);
end;
$fn$;

create or replace function maintenance_private.maintenance_redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, maintenance_private, extensions
as $fn$
declare
  v_headers jsonb;
  v_ip inet;
  v_code maintenance_private.access_codes%rowtype;
  v_token text;
begin
  v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip := split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip', v_headers->>'x-real-ip', '0.0.0.0'), ',', 1)::inet;

  delete from maintenance_private.access_attempts where attempted_at < now() - interval '1 day';
  perform pg_advisory_xact_lock(hashtext(v_ip::text));
  if (select count(*) from maintenance_private.access_attempts
      where client_ip = v_ip and attempted_at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'message', '尝试次数过多，请 15 分钟后再试');
  end if;

  if p_code is null or p_code !~ '^[0-9]{6}$' then
    insert into maintenance_private.access_attempts(client_ip) values (v_ip);
    return jsonb_build_object('ok', false, 'message', '验证码无效、已过期或已撤销');
  end if;

  select * into v_code
  from maintenance_private.access_codes
  where code_hash = encode(extensions.digest(convert_to(p_code, 'UTF8'), 'sha256'), 'hex')
    and revoked_at is null and expires_at > now() and used_count < max_uses
  for update;

  if not found then
    insert into maintenance_private.access_attempts(client_ip) values (v_ip);
    return jsonb_build_object('ok', false, 'message', '验证码无效、已过期或已撤销');
  end if;

  update maintenance_private.access_codes set used_count = used_count + 1 where id = v_code.id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into maintenance_private.access_sessions(code_id, token_hash, expires_at)
  values (v_code.id, encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), v_code.expires_at);

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_code.expires_at);
end;
$fn$;

create or replace function maintenance_private.maintenance_validate_access(p_token text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, maintenance_private, extensions
as $fn$
  select exists (
    select 1
    from maintenance_private.access_sessions s
    join maintenance_private.access_codes c on c.id = s.code_id
    where p_token is not null
      and s.token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
      and s.revoked_at is null and s.expires_at > now()
      and c.revoked_at is null and c.expires_at > now()
  );
$fn$;

revoke all on function maintenance_private.admin_create_maintenance_code(integer, integer) from public;
revoke all on function maintenance_private.admin_revoke_maintenance_codes() from public;
revoke all on function maintenance_private.maintenance_redeem_code(text) from public;
revoke all on function maintenance_private.maintenance_validate_access(text) from public;
grant execute on function maintenance_private.admin_create_maintenance_code(integer, integer) to authenticated;
grant execute on function maintenance_private.admin_revoke_maintenance_codes() to authenticated;
grant execute on function maintenance_private.maintenance_redeem_code(text) to anon, authenticated;
grant execute on function maintenance_private.maintenance_validate_access(text) to anon, authenticated;

create or replace function public.admin_create_maintenance_code(
  p_valid_minutes integer default 15,
  p_max_uses integer default 1
)
returns jsonb
language sql
security invoker
set search_path = public, maintenance_private
as $fn$ select maintenance_private.admin_create_maintenance_code(p_valid_minutes, p_max_uses); $fn$;

create or replace function public.admin_revoke_maintenance_codes()
returns jsonb
language sql
security invoker
set search_path = public, maintenance_private
as $fn$ select maintenance_private.admin_revoke_maintenance_codes(); $fn$;

create or replace function public.maintenance_redeem_code(p_code text)
returns jsonb
language sql
security invoker
set search_path = public, maintenance_private
as $fn$ select maintenance_private.maintenance_redeem_code(p_code); $fn$;

create or replace function public.maintenance_validate_access(p_token text)
returns boolean
language sql
stable
security invoker
set search_path = public, maintenance_private
as $fn$ select maintenance_private.maintenance_validate_access(p_token); $fn$;

revoke all on function public.admin_create_maintenance_code(integer, integer) from public, anon, authenticated;
revoke all on function public.admin_revoke_maintenance_codes() from public, anon, authenticated;
revoke all on function public.maintenance_redeem_code(text) from public, anon, authenticated;
revoke all on function public.maintenance_validate_access(text) from public, anon, authenticated;
grant execute on function public.admin_create_maintenance_code(integer, integer) to authenticated;
grant execute on function public.admin_revoke_maintenance_codes() to authenticated;
grant execute on function public.maintenance_redeem_code(text) to anon, authenticated;
grant execute on function public.maintenance_validate_access(text) to anon, authenticated;
