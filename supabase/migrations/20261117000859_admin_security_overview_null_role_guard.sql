-- Keep admin security overview inaccessible to authenticated users
-- whose profile/role lookup resolves to NULL.
-- The same change was already applied to production; this file synchronizes
-- the migration history with the live database.

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
  if auth.uid() is null
     or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'super administrator required'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'login', jsonb_build_object(
      'active_identifiers_24h',
        count(*) filter (
          where a.window_started_at >= pg_catalog.now() - interval '24 hours'
        ),
      'attempts_24h',
        coalesce(sum(a.attempts) filter (
          where a.window_started_at >= pg_catalog.now() - interval '24 hours'
        ), 0),
      'currently_rate_limited',
        count(*) filter (
          where a.window_started_at >= pg_catalog.now() - interval '15 minutes'
            and a.attempts > 8
        ),
      'latest_window_at', max(a.window_started_at),
      'auth_failures_24h', coalesce((
        select sum(r.attempts)
        from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours'
      ), 0),
      'email_failures_24h', coalesce((
        select sum(r.attempts)
        from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours'
          and r.method = 'email'
      ), 0),
      'username_failures_24h', coalesce((
        select sum(r.attempts)
        from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours'
          and r.method = 'username'
      ), 0),
      'admin_failures_24h', coalesce((
        select sum(r.attempts)
        from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= pg_catalog.now() - interval '24 hours'
          and r.method = 'admin'
      ), 0),
      'failure_latest_at', (
        select max(r.bucket_minute)
        from login_private.auth_login_failure_rollups r
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
            'actor_name',
              coalesce(nullif(p.display_name, ''), p.username, '管理员'),
            'high_risk', (
              l.action ilike '%delete%'
              or l.action ilike '%role%'
              or l.action ilike '%ban%'
              or l.action ilike '%maintenance%'
              or l.action ilike '%feature_flag%'
              or l.action ilike '%export%'
              or l.action ilike '%password%'
              or l.action ilike '%security%'
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
      'active_identifiers_24h', 0,
      'attempts_24h', 0,
      'currently_rate_limited', 0,
      'latest_window_at', null,
      'auth_failures_24h', 0,
      'email_failures_24h', 0,
      'username_failures_24h', 0,
      'admin_failures_24h', 0,
      'failure_latest_at', null
    ),
    'recent_admin_actions', '[]'::jsonb
  ));
end;
$function$;

revoke all on function public.admin_security_overview()
from public, anon;

grant execute on function public.admin_security_overview()
to authenticated;
