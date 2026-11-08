-- 20261031161715_admin_security_overview.sql
-- Return aggregate login-rate-limit metrics and a sanitized recent admin audit feed.
-- Never expose identifier hashes or raw audit detail to the browser.

begin;

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
    'generated_at', now(),
    'login', jsonb_build_object(
      'active_identifiers_24h', count(*) filter (where a.window_started_at >= now() - interval '24 hours'),
      'attempts_24h', coalesce(sum(a.attempts) filter (where a.window_started_at >= now() - interval '24 hours'), 0),
      'currently_rate_limited', count(*) filter (
        where a.window_started_at >= now() - interval '15 minutes' and a.attempts > 8
      ),
      'latest_window_at', max(a.window_started_at)
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
    'generated_at', now(),
    'login', jsonb_build_object('active_identifiers_24h', 0, 'attempts_24h', 0, 'currently_rate_limited', 0, 'latest_window_at', null),
    'recent_admin_actions', '[]'::jsonb
  ));
end;
$function$;

revoke all on function public.admin_security_overview() from public, anon;
grant execute on function public.admin_security_overview() to authenticated;

commit;
