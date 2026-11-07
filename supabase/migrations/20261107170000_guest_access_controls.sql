-- Guest access controls managed from the super-admin settings page.
-- Public guest browsing remains strictly read-only and only exposes published content.

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

  if coalesce(v_enabled, 'true') <> 'true' then
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
    ), true);
$function$;

revoke all on function guest_api_private.guest_love_wall_available() from public;
grant execute on function guest_api_private.guest_love_wall_available() to anon, authenticated;

-- Keep the public landing RPC as a small allowlist; never return arbitrary site_settings.
create or replace function guest_api_private.public_guest_landing_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $
  select pg_catalog.jsonb_build_object(
    'site_title', coalesce((select value from public.site_settings where key = 'site_title' limit 1), '堯'),
    'site_subtitle', coalesce((select value from public.site_settings where key = 'site_subtitle' limit 1), '公开浏览'),
    'home_banner_text', coalesce((select value from public.site_settings where key = 'home_banner_text' limit 1), '欢迎来到堯'),
    'home_banner_url', coalesce((select value from public.site_settings where key = 'home_banner_url' limit 1), ''),
    'close_login_entry', coalesce((select value from public.site_settings where key = 'close_login_entry' limit 1), 'false'),
    'skip_login_screen', coalesce((select value from public.site_settings where key = 'skip_login_screen' limit 1), 'false'),
    'guest_browse_available', guest_api_private.guest_browse_available(),
    'guest_entry_visible', coalesce((select value from public.site_settings where key = 'guest_entry_visible' limit 1), 'true') = 'true',
    'guest_session_minutes', case
      when (select value from public.site_settings where key = 'guest_session_minutes' limit 1)
        = any (array['15','30','60','120','240','480','720','1440']::text[])
      then (select value from public.site_settings where key = 'guest_session_minutes' limit 1)
      else '60'
    end,
    'guest_session_epoch', coalesce((select value from public.site_settings where key = 'guest_session_epoch' limit 1), '1'),
    'guest_show_love_wall', coalesce((select value from public.site_settings where key = 'guest_show_love_wall' limit 1), 'true') = 'true',
    'guest_show_announcements', coalesce((select value from public.site_settings where key = 'guest_show_announcements' limit 1), 'true') = 'true',
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
      when coalesce((select value from public.site_settings where key = 'guest_show_announcements' limit 1), 'true') = 'true'
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

-- The RPC returns no published posts while guest access or the guest wall is disabled.
create or replace function public.love_wall_guest_published()
returns table (
  id uuid,
  recipient_name text,
  category text,
  content text,
  is_anonymous boolean,
  created_at timestamptz,
  comment_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id,
    p.recipient_name,
    p.category,
    p.content,
    p.is_anonymous,
    p.created_at,
    count(c.id)::bigint as comment_count
  from public.love_wall_posts p
  left join public.love_wall_comments c
    on c.post_id = p.id
   and c.deleted_at is null
  where p.status = 'published'
    and guest_api_private.guest_love_wall_available()
  group by p.id
  order by p.created_at desc
  limit 100;
$function$;

revoke all on function public.love_wall_guest_published() from public, anon, authenticated;
grant execute on function public.love_wall_guest_published() to anon, authenticated;

-- Disabling guest access or the public wall also blocks guest media metadata and objects.
create or replace function guest_api_private.love_wall_media_public_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select guest_api_private.guest_love_wall_available()
    and exists (
      select 1
      from public.love_wall_media m
      join public.love_wall_posts p on p.id = m.post_id
      where m.path = p_path
        and p.status = 'published'
    );
$function$;

revoke all on function guest_api_private.love_wall_media_public_readable(text) from public;
grant execute on function guest_api_private.love_wall_media_public_readable(text) to anon, authenticated;

drop policy if exists love_wall_media_public_guest_read on public.love_wall_media;
create policy love_wall_media_public_guest_read
  on public.love_wall_media
  for select
  to anon
  using (guest_api_private.love_wall_media_public_readable(path));

drop policy if exists love_wall_media_public_guest_object_read on storage.objects;
create policy love_wall_media_public_guest_object_read
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'media'
    and guest_api_private.love_wall_media_public_readable(name)
  );
