-- 20261122160000_app_click_events.sql
-- 软件点击统计：谁点了哪个单独软件、点了多少次。
-- 写入只走 SECURITY DEFINER 的 log_app_click()（anon/authenticated 可调，
-- profile_id 一律取 auth.uid()，不信任客户端传的人），表本身不对客户端开放；
-- 读取只走管理员 RPC admin_list_app_click_events / admin_app_click_stats。
-- 埋点：发现页音乐/签名卡、主站与管理版更新框、音乐下载页更新卡片、
-- 后台应用管理复制链接/二维码。电台与真实世界目前站内无入口，计数为 0，
-- 有入口后再埋。回滚：drop table public.app_click_events cascade 即可
-- （三函数随表删除；前端埋点失败静默，不影响原功能）。
create table if not exists public.app_click_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  profile_id uuid,
  app text not null check (app in ('main', 'admin', 'musicdl', 'radio', 'realworld', 'music', 'signature')),
  event text not null check (event in ('entry_click', 'download_click', 'update_prompt_shown', 'update_click', 'update_ignored', 'copy_link', 'qr_view')),
  source text not null default '',
  app_version_name text,
  app_version_code integer,
  client_platform text not null default '',
  device_label text not null default '',
  user_agent text not null default ''
);
alter table public.app_click_events enable row level security;

create or replace function public.log_app_click(
  p_app text, p_event text, p_source text default '',
  p_app_version_name text default null, p_app_version_code integer default null,
  p_client_platform text default '', p_device_label text default '', p_user_agent text default ''
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if p_app not in ('main', 'admin', 'musicdl', 'radio', 'realworld', 'music', 'signature') then
    raise exception 'bad app';
  end if;
  if p_event not in ('entry_click', 'download_click', 'update_prompt_shown', 'update_click', 'update_ignored', 'copy_link', 'qr_view') then
    raise exception 'bad event';
  end if;
  insert into public.app_click_events(app, event, source, app_version_name, app_version_code, client_platform, device_label, user_agent, profile_id)
  values (p_app, p_event, nullif(p_source, ''), nullif(p_app_version_name, ''), p_app_version_code,
    coalesce(p_client_platform, ''), coalesce(p_device_label, ''), coalesce(p_user_agent, ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_app_click(text, text, text, text, integer, text, text, text) from public;
grant execute on function public.log_app_click(text, text, text, text, integer, text, text, text) to anon, authenticated;

create or replace function public.admin_list_app_click_events(
  p_days integer default 30, p_app text default null, p_limit integer default 100
) returns table(
  id bigint, created_at timestamptz, profile_id uuid, display_name text,
  app text, event text, source text, app_version_name text, app_version_code integer,
  client_platform text, device_label text
)
language sql security definer set search_path = '' as $$
  select e.id, e.created_at, e.profile_id, p.display_name,
    e.app, e.event, e.source, e.app_version_name, e.app_version_code,
    e.client_platform, e.device_label
  from public.app_click_events e
  left join public.profiles p on p.id = e.profile_id
  where (auth.uid() is not null and public.my_role() in ('admin', 'super_admin'))
    and e.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
    and (p_app is null or p_app = '' or e.app = p_app)
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;
revoke all on function public.admin_list_app_click_events(integer, text, integer) from public;
grant execute on function public.admin_list_app_click_events(integer, text, integer) to authenticated;

create or replace function public.admin_app_click_stats(p_days integer default 30)
returns jsonb
language sql security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'by_app', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('app', app, 'total', cnt) order by app)
      from (
        select a.app, count(e.id) as cnt
        from (select unnest(array['main', 'admin', 'musicdl', 'radio', 'realworld', 'music', 'signature']) as app) a
        left join public.app_click_events e
          on e.app = a.app
          and e.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
        group by a.app
      ) s
    ), '[]'::jsonb),
    'by_event', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('app', app, 'event', event, 'total', total) order by total desc)
      from (
        select app, event, count(*) as total
        from public.app_click_events
        where created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
        group by app, event
      ) s
    ), '[]'::jsonb),
    'daily', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'total', cnt) order by day)
      from (
        select d.day, count(e.id) as cnt
        from generate_series(
          date_trunc('day', now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)) - 1)),
          date_trunc('day', now()), interval '1 day'
        ) d(day)
        left join public.app_click_events e on date_trunc('day', e.created_at) = d.day
        group by d.day
      ) s
    ), '[]'::jsonb)
  )
  where auth.uid() is not null and public.my_role() in ('admin', 'super_admin');
$$;
revoke all on function public.admin_app_click_stats(integer) from public;
grant execute on function public.admin_app_click_stats(integer) to authenticated;
