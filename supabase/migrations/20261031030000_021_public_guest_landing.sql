-- 021: 受限的访客首页数据接口
-- 内部读取函数放在非 Data API 暴露的 private schema；public RPC 仅作安全包装。
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.public_guest_landing_data()
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
    'maintenance', coalesce((select value from public.site_settings where key = 'maintenance' limit 1), 'false'),
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

revoke all on function private.public_guest_landing_data() from public, anon, authenticated;
grant execute on function private.public_guest_landing_data() to anon, authenticated;

-- SECURITY INVOKER 包装函数不会自行绕过 RLS；它只调用 private 中的白名单数据函数。
create or replace function public.public_guest_landing()
returns jsonb
language sql
stable
security invoker
set search_path = public, private
as $$
  select private.public_guest_landing_data();
$$;

revoke all on function public.public_guest_landing() from public, anon, authenticated;
grant execute on function public.public_guest_landing() to anon, authenticated;
