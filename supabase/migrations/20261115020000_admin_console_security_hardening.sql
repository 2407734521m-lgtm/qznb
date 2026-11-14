-- Admin console hardening (excluding MFA/TOTP changes).
-- Adds admin login telemetry, own-session inventory, and stricter audit-log writes.

begin;

-- Extend privacy-preserving login failure telemetry with an admin-only UI category.
alter table login_private.auth_login_failure_rollups
  drop constraint if exists auth_login_failure_rollups_method_check;

alter table login_private.auth_login_failure_rollups
  add constraint auth_login_failure_rollups_method_check
  check (method in ('email', 'username', 'admin'));

create or replace function public.record_auth_login_failure(
  p_method text,
  p_failure_class text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_bucket timestamptz := pg_catalog.date_trunc('minute', pg_catalog.now());
  v_total integer;
begin
  if p_method is null
     or p_method not in ('email', 'username', 'admin')
     or p_failure_class is null
     or p_failure_class not in (
       'invalid_credentials', 'email_not_confirmed', 'rate_limited', 'network', 'other'
     ) then
    return;
  end if;

  delete from login_private.auth_login_failure_rollups
   where bucket_minute < pg_catalog.now() - interval '30 days';

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('auth-login-failure-rollup:' || v_bucket::text, 0)
  );

  select coalesce(sum(r.attempts), 0)::integer
    into v_total
    from login_private.auth_login_failure_rollups r
   where r.bucket_minute = v_bucket;

  if v_total >= 500 then
    return;
  end if;

  insert into login_private.auth_login_failure_rollups(bucket_minute, method, failure_class, attempts)
  values (v_bucket, p_method, p_failure_class, 1)
  on conflict (bucket_minute, method, failure_class)
  do update set attempts = least(login_private.auth_login_failure_rollups.attempts + 1, 500);
end;
$function$;

revoke all on function public.record_auth_login_failure(text, text) from public;
grant execute on function public.record_auth_login_failure(text, text) to anon, authenticated;

-- The browser may read its own administrator session inventory, but never
-- another user's sessions and never the auth.sessions table directly.
create or replace function public.admin_list_own_sessions()
returns table (
  session_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamp,
  not_after timestamptz,
  device_label text,
  is_current boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.created_at,
    s.updated_at,
    s.refreshed_at,
    s.not_after,
    case
      when coalesce(s.user_agent, '') ilike '%Android%' then 'Android 设备'
      when coalesce(s.user_agent, '') ilike '%iPhone%'
        or coalesce(s.user_agent, '') ilike '%iPad%'
        or coalesce(s.user_agent, '') ilike '%iPod%' then 'Apple 移动设备'
      when coalesce(s.user_agent, '') ilike '%Windows%' then 'Windows 设备'
      when coalesce(s.user_agent, '') ilike '%Macintosh%' then 'Mac 设备'
      when coalesce(s.user_agent, '') ilike '%Linux%' then 'Linux 设备'
      else '浏览器或未知设备'
    end,
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > pg_catalog.now())
  order by s.updated_at desc nulls last, s.created_at desc
  limit 25;
end;
$function$;

revoke all on function public.admin_list_own_sessions() from public, anon;
grant execute on function public.admin_list_own_sessions() to authenticated;

-- Record the authenticated actor in the dedicated actor column. Do not persist
-- malformed raw detail strings, and cap detail size to keep secrets/large payloads
-- out of the audit stream.
create or replace function public.log_admin_action(p_action text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_detail jsonb;
  v_action text := pg_catalog.btrim(coalesce(p_action, ''));
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_action = '' or pg_catalog.char_length(v_action) > 100 then
    raise exception 'invalid audit action' using errcode = '22023';
  end if;

  if p_detail is null or p_detail = '' then
    v_detail := '{}'::jsonb;
  elsif pg_catalog.char_length(p_detail) > 16000 then
    v_detail := '{"_detail_omitted":"payload_too_large"}'::jsonb;
  else
    begin
      v_detail := p_detail::jsonb;
    exception when others then
      v_detail := '{"_detail_omitted":"invalid_json"}'::jsonb;
    end;
  end if;

  if pg_catalog.jsonb_typeof(v_detail) <> 'object' then
    v_detail := pg_catalog.jsonb_build_object('value', v_detail);
  end if;

  v_detail := v_detail || pg_catalog.jsonb_build_object(
    '_by', auth.uid()::text,
    '_at', pg_catalog.now()::text
  );

  insert into public.admin_audit_logs (actor, action, detail)
  values (auth.uid(), v_action, v_detail);
end;
$function$;

revoke all on function public.log_admin_action(text, text) from public, anon;
grant execute on function public.log_admin_action(text, text) to authenticated;

-- Remove direct table mutation privileges. All writes now go through the
-- authenticated, role-checked SECURITY DEFINER RPC above.
revoke all on table public.admin_audit_logs from public, anon, authenticated;
grant select on table public.admin_audit_logs to authenticated;

-- This RPC already checks auth.uid() and the administrator role internally.
-- Remove the unnecessary anon EXECUTE grant while preserving authenticated access.
revoke execute on function public.admin_client_stats() from anon;

-- Expose the new administrator login counter in the existing super-admin view.
create or replace function public.admin_security_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'login', jsonb_build_object(
      'active_identifiers_24h', count(*) filter (where a.window_started_at >= pg_catalog.now() - interval '24 hours'),
      'attempts_24h', coalesce(sum(a.attempts) filter (where a.window_started_at >= pg_catalog.now() - interval '24 hours'), 0),
      'currently_rate_limited', count(*) filter (
        where a.window_started_at >= pg_catalog.now() - interval '15 minutes' and a.attempts > 8
      ),
      'latest_window_at', max(a.window_started_at),
      'auth_failures_24h', coalesce((
        select sum(r.attempts) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours'
      ), 0),
      'email_failures_24h', coalesce((
        select sum(r.attempts) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours' and r.method = 'email'
      ), 0),
      'username_failures_24h', coalesce((
        select sum(r.attempts) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours' and r.method = 'username'
      ), 0),
      'admin_failures_24h', coalesce((
        select sum(r.attempts) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours' and r.method = 'admin'
      ), 0),
      'failure_latest_at', (
        select max(r.bucket_minute) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours'
      )
    ),
    'recent_admin_actions', coalesce((
      select jsonb_agg(x.item order by x.created_at desc)
      from (
        select
          jsonb_build_object(
            'id', l.id,
            'action', l.action,
            'created_at', l.created_at,
            'actor_name', coalesce(nullif(p.display_name, ''), p.username, '管理员'),
            'high_risk', (
              l.action ilike '%delete%' or l.action ilike '%role%'
              or l.action ilike '%ban%' or l.action ilike '%maintenance%'
              or l.action ilike '%feature_flag%' or l.action ilike '%export%'
              or l.action ilike '%password%' or l.action ilike '%security%'
            )
          ) as item,
          l.created_at
        from public.admin_audit_logs l
        left join public.profiles p on p.id = l.actor
        order by l.created_at desc
        limit 25
      ) x
    ), '[]'::jsonb)
  )
  into v_result
  from login_private.username_login_attempts a;

  return coalesce(v_result, jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'login', jsonb_build_object(
      'active_identifiers_24h', 0, 'attempts_24h', 0, 'currently_rate_limited', 0,
      'latest_window_at', null, 'auth_failures_24h', 0, 'email_failures_24h', 0,
      'username_failures_24h', 0, 'admin_failures_24h', 0, 'failure_latest_at', null
    ),
    'recent_admin_actions', '[]'::jsonb
  ));
end;
$function$;

revoke all on function public.admin_security_overview() from public, anon;
grant execute on function public.admin_security_overview() to authenticated;

commit;
