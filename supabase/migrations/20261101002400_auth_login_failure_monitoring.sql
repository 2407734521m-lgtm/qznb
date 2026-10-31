-- Aggregate, privacy-preserving login failure telemetry.
-- No email, username, password, OTP, raw IP, or user-agent is stored.

begin;

create table if not exists login_private.auth_login_failure_rollups (
  bucket_minute timestamptz not null,
  method text not null check (method in ('email', 'username')),
  failure_class text not null check (failure_class in (
    'invalid_credentials', 'email_not_confirmed', 'rate_limited', 'network', 'other'
  )),
  attempts integer not null default 0 check (attempts between 0 and 500),
  primary key (bucket_minute, method, failure_class)
);

revoke all on table login_private.auth_login_failure_rollups from public, anon, authenticated;

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
  v_bucket timestamptz := date_trunc('minute', now());
  v_total integer;
begin
  if p_method not in ('email', 'username')
    or p_failure_class not in ('invalid_credentials', 'email_not_confirmed', 'rate_limited', 'network', 'other') then
    return;
  end if;

  -- Retain only 30 days of coarse aggregate telemetry.
  delete from login_private.auth_login_failure_rollups
   where bucket_minute < now() - interval '30 days';

  -- A single global minute bucket prevents an unauthenticated caller from
  -- creating unbounded rows or inflating counts without limit.
  perform pg_advisory_xact_lock(hashtextextended('auth-login-failure-rollup:' || v_bucket::text, 0));

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
      'latest_window_at', max(a.window_started_at),
      'auth_failures_24h', coalesce((
        select sum(r.attempts) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= now() - interval '24 hours'
      ), 0),
      'email_failures_24h', coalesce((
        select sum(r.attempts) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= now() - interval '24 hours' and r.method = 'email'
      ), 0),
      'username_failures_24h', coalesce((
        select sum(r.attempts) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= now() - interval '24 hours' and r.method = 'username'
      ), 0),
      'failure_latest_at', (
        select max(r.bucket_minute) from login_private.auth_login_failure_rollups r
        where r.bucket_minute >= now() - interval '24 hours'
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
    'generated_at', now(),
    'login', jsonb_build_object(
      'active_identifiers_24h', 0, 'attempts_24h', 0, 'currently_rate_limited', 0,
      'latest_window_at', null, 'auth_failures_24h', 0, 'email_failures_24h', 0,
      'username_failures_24h', 0, 'failure_latest_at', null
    ),
    'recent_admin_actions', '[]'::jsonb
  ));
end;
$function$;

revoke all on function public.admin_security_overview() from public, anon;
grant execute on function public.admin_security_overview() to authenticated;

commit;
