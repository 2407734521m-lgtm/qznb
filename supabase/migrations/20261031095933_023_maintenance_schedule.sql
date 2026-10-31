-- 023: 定时维护模式
-- 定时区间由数据库在每次访客配置读取时按 now() 计算，不依赖管理员在线或浏览器后台计时器。
-- 计划启用时优先于手动 maintenance 开关；计划结束后自动关闭，取消计划后恢复手动开关。

create or replace function guest_api_private.public_guest_landing_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'site_title', coalesce((select value from public.site_settings where key = 'site_title' limit 1), '我们的班级'),
    'site_subtitle', coalesce((select value from public.site_settings where key = 'site_subtitle' limit 1), '青春档案'),
    'home_banner_text', coalesce((select value from public.site_settings where key = 'home_banner_text' limit 1), '把我们的青春，留在这里'),
    'home_banner_url', coalesce((select value from public.site_settings where key = 'home_banner_url' limit 1), ''),
    'close_login_entry', coalesce((select value from public.site_settings where key = 'close_login_entry' limit 1), 'false'),
    'skip_login_screen', coalesce((select value from public.site_settings where key = 'skip_login_screen' limit 1), 'false'),
    'maintenance', case
      when coalesce((
        select coalesce((value::jsonb ->> 'enabled')::boolean, false)
        from public.site_settings where key = 'maintenance_schedule' limit 1
      ), false) then
        case
          when (
            select nullif(value::jsonb ->> 'start_at', '')::timestamptz
            from public.site_settings where key = 'maintenance_schedule' limit 1
          ) <= now()
          and (
            select nullif(value::jsonb ->> 'end_at', '')::timestamptz
            from public.site_settings where key = 'maintenance_schedule' limit 1
          ) > now()
          then 'true'
          else 'false'
        end
      else coalesce((select value from public.site_settings where key = 'maintenance' limit 1), 'false')
    end,
    'maintenance_title', coalesce((select value from public.site_settings where key = 'maintenance_title' limit 1), ''),
    'maintenance_msg', coalesce((select value from public.site_settings where key = 'maintenance_msg' limit 1), ''),
    'notices', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', n.id, 'title', n.title, 'content', n.content, 'created_at', n.created_at)
        order by n.is_pinned desc, n.created_at desc
      )
      from (
        select id, title, content, created_at, is_pinned
        from public.board_messages
        where is_admin_msg = true
          and deleted_at is null
          and (expires_at is null or expires_at > now())
        order by is_pinned desc, created_at desc
        limit 8
      ) as n
    ), '[]'::jsonb)
  );
$$;
