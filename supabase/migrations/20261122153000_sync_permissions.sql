-- 20261122153000_sync_permissions.sql
-- fix(sync): permissions — site_settings SELECT 收紧 + guest_* 缺省改 fail-closed。
-- 任务：第 2 步修权限脱节（R1/R2 的后续，PR #819 已合并）。
--
-- 任务 1：ss_sel 原为 using(true)，任何 authenticated 成员可直读全部配置键
--   （游客开关、维护开关、应用版本号、邀请/横幅口径等）。写侧 ss_ins/ss_upd
--   已是超管专属，不动。
-- 任务 2：guest_show_love_wall / guest_show_announcements 两键在生产库缺失，
--   各处 coalesce(..., 'true') 使缺省为开；guest_browse_enabled 缺失时同样
--   coalesce true，主开关也 fail-open。021 迁移口径是默认关。
--
-- 设计（改动最小、不断正常读路）：
--   * 直接读 site_settings 的前端只有：Home.tsx（普通成员，仅用 site_title/
--     site_subtitle）、main.tsx（管理后台壳，仅 site_title）、其余全是管理页。
--     未登录端不直读表，只走 SECURITY DEFINER 的 public_guest_landing 等 RPC，
--     RLS 收紧对它们无影响（public_app_update / public_admin_app_update /
--     public_musicdl_app_update / public_guest_landing 生产上均为 SECURITY DEFINER，
--     已回读核对）。
--   * ss_sel 拆成两条：公开白名单（anon + authenticated，仅 site_title /
--     site_subtitle）+ 管理员全读（my_role() in ('admin','super_admin')，与
--     ss_ins/ss_upd 同一套语义；未过二级 PIN 时 my_role() 返回 'member'，
--     与管理页的 PIN 门禁一致）。
--   * guest_* 缺省一律改 'false'：guest_browse_available()、guest_love_wall_available()、
--     public_guest_landing_data()、admin_get_guest_access_settings() 四处。
--     其中 admin_get_ 的缺省同步改 false，否则后台页仍会把缺失键显示成“已开启”，
--     与实际生效值不一致（后台页直接渲染该 RPC 的返回值，改后即为“当前生效值（含缺省）”）。
--   * 另把缺失的三键以 fail-closed 值显式写进表（行为与新缺省完全一致，仅让库里
--     状态自描述、显式键为准）：guest_show_love_wall='false'、
--     guest_show_announcements='false'、guest_schedule='{"enabled":false,...}'。
--   * 游客模式本身不动：生产 guest_browse_enabled='true' 是显式开启，改后仍为 true，
--     游客首页仍可用；只有关掉的是此前因“缺失”而被默认打开的表白墙全文与公告。
--   * 注意：public_guest_landing_data() 在生产里的 notices 子查询含
--     audience <> 'app' 过滤（后来的漂移），本迁移按生产版原样保留，只改 4 处
--     guest_* 缺省；site_title 等展示类缺省不动（resolveBrandTitle 会回退）。
--   * 不动：ss_ins/ss_upd、public_* 更新 RPC、点击统计、漂移迁移、电台/真实世界 UA。
--
-- 回滚：重建旧 ss_sel（using(true)）并把本文件 4 处 'false' 缺省改回 'true'；
--   显式写进的三行可用 delete 删掉（删后即回缺省语义）。

-- ============ 任务 1：site_settings SELECT 收紧 ============
drop policy if exists ss_sel on public.site_settings;

create policy ss_sel_public
  on public.site_settings
  for select
  to anon, authenticated
  using (key in ('site_title', 'site_subtitle'));

create policy ss_sel_admin
  on public.site_settings
  for select
  to authenticated
  using (public.my_role() in ('admin', 'super_admin'));

-- ============ 任务 2：guest_* 缺省 fail-closed ============

-- 主开关：缺失键不再默认开。guest_schedule 缺失仍表示“无定时限制”
-- （限制只由 enabled 的时间窗产生），不是 fail-open，保持原样。
create or replace function guest_api_private.guest_browse_available()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_enabled text;
  v_schedule_text text;
  v_schedule jsonb;
  v_start timestamptz;
  v_end timestamptz;
begin
  select s.value into v_enabled
  from public.site_settings s
  where s.key = 'guest_browse_enabled'
  limit 1;

  if coalesce(v_enabled, 'false') <> 'true' then
    return false;
  end if;

  select s.value into v_schedule_text
  from public.site_settings s
  where s.key = 'guest_schedule'
  limit 1;

  if v_schedule_text is null or pg_catalog.btrim(v_schedule_text) = '' then
    return true;
  end if;

  begin
    v_schedule := v_schedule_text::jsonb;
    if coalesce((v_schedule ->> 'enabled')::boolean, false) is not true then
      return true;
    end if;

    v_start := nullif(v_schedule ->> 'start_at', '')::timestamptz;
    v_end := nullif(v_schedule ->> 'end_at', '')::timestamptz;

    if v_start is null or v_end is null or v_end <= v_start then
      return false;
    end if;

    return pg_catalog.now() >= v_start and pg_catalog.now() < v_end;
  exception when others then
    -- Invalid schedules fail closed instead of accidentally opening guest access.
    return false;
  end;
end;
$function$;

revoke all on function guest_api_private.guest_browse_available() from public;
grant execute on function guest_api_private.guest_browse_available() to anon, authenticated;

create or replace function guest_api_private.guest_love_wall_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select guest_api_private.guest_browse_available()
    and coalesce((
      select s.value = 'true'
      from public.site_settings s
      where s.key = 'guest_show_love_wall'
      limit 1
    ), false);
$function$;

revoke all on function guest_api_private.guest_love_wall_available() from public;
grant execute on function guest_api_private.guest_love_wall_available() to anon, authenticated;

-- 按生产版原样重建（保留 notices 子查询的 audience <> 'app' 过滤），只改 4 处缺省。
create or replace function guest_api_private.public_guest_landing_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'site_title', coalesce((select value from public.site_settings where key = 'site_title' limit 1), '堯'),
    'site_subtitle', coalesce((select value from public.site_settings where key = 'site_subtitle' limit 1), '公开浏览'),
    'home_banner_text', coalesce((select value from public.site_settings where key = 'home_banner_text' limit 1), '欢迎来到堯'),
    'home_banner_url', coalesce((select value from public.site_settings where key = 'home_banner_url' limit 1), ''),
    'close_login_entry', coalesce((select value from public.site_settings where key = 'close_login_entry' limit 1), 'false'),
    'skip_login_screen', coalesce((select value from public.site_settings where key = 'skip_login_screen' limit 1), 'false'),
    'guest_browse_available', guest_api_private.guest_browse_available(),
    'guest_entry_visible', coalesce((select value from public.site_settings where key = 'guest_entry_visible' limit 1), 'false') = 'true',
    'guest_session_minutes', case
      when (select value from public.site_settings where key = 'guest_session_minutes' limit 1)
        = any (array['15','30','60','120','240','480','720','1440']::text[])
      then (select value from public.site_settings where key = 'guest_session_minutes' limit 1)
      else '60'
    end,
    'guest_session_epoch', coalesce((select value from public.site_settings where key = 'guest_session_epoch' limit 1), '1'),
    'guest_show_love_wall', coalesce((select value from public.site_settings where key = 'guest_show_love_wall' limit 1), 'false') = 'true',
    'guest_show_announcements', coalesce((select value from public.site_settings where key = 'guest_show_announcements' limit 1), 'false') = 'true',
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
    'notices', case
      when coalesce((select value from public.site_settings where key = 'guest_show_announcements' limit 1), 'false') = 'true'
      then coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('id', n.id, 'title', n.title, 'content', n.content, 'created_at', n.created_at)
          order by n.is_pinned desc, n.created_at desc
        )
        from (
          select id, title, content, created_at, is_pinned
          from public.board_messages
          where is_admin_msg = true
            and deleted_at is null
            and audience <> 'app'
            and (expires_at is null or expires_at > now())
          order by is_pinned desc, created_at desc
          limit 8
        ) as n
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
$$;

revoke all on function guest_api_private.public_guest_landing_data() from public, anon, authenticated;
grant execute on function guest_api_private.public_guest_landing_data() to anon, authenticated;

-- 后台取值 RPC 的缺省同步改 false，否则管理页会把缺失键显示成“已开启”。
create or replace function public.admin_get_guest_access_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'guest_browse_enabled', coalesce((select s.value from public.site_settings s where s.key = 'guest_browse_enabled' limit 1), 'false'),
    'guest_entry_visible', coalesce((select s.value from public.site_settings s where s.key = 'guest_entry_visible' limit 1), 'false'),
    'guest_session_minutes', case
      when (select s.value from public.site_settings s where s.key = 'guest_session_minutes' limit 1)
        = any (array['15','30','60','120','240','480','720','1440']::text[])
      then (select s.value from public.site_settings s where s.key = 'guest_session_minutes' limit 1)
      else '60'
    end,
    'guest_session_epoch', coalesce((select s.value from public.site_settings s where s.key = 'guest_session_epoch' limit 1), '1'),
    'guest_show_love_wall', coalesce((select s.value from public.site_settings s where s.key = 'guest_show_love_wall' limit 1), 'false'),
    'guest_show_announcements', coalesce((select s.value from public.site_settings s where s.key = 'guest_show_announcements' limit 1), 'false'),
    'guest_schedule', coalesce((select s.value from public.site_settings s where s.key = 'guest_schedule' limit 1), '{"enabled":false,"start_at":null,"end_at":null}')
  );
end;
$function$;

revoke all on function public.admin_get_guest_access_settings() from public, anon;
grant execute on function public.admin_get_guest_access_settings() to authenticated;

-- 缺失的三键以 fail-closed 值显式写进表（与新缺省行为完全一致，仅让库里状态自描述）。
insert into public.site_settings(key, value) values
  ('guest_show_love_wall', 'false'),
  ('guest_show_announcements', 'false'),
  ('guest_schedule', '{"enabled":false,"start_at":null,"end_at":null}')
on conflict (key) do nothing;
