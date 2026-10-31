-- Aggregate-only analytics for super administrators. No member identifiers
-- or content bodies are returned.

begin;

create or replace function public.admin_analytics_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_days integer := coalesce(p_days, 30);
  v_result jsonb;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;
  if v_days not in (7, 14, 30, 90) then
    raise exception 'days must be 7, 14, 30, or 90';
  end if;

  with
  bounds as (
    select
      pg_catalog.date_trunc('day', pg_catalog.now()) - pg_catalog.make_interval(days => v_days - 1) as series_start_at,
      pg_catalog.date_trunc('day', pg_catalog.now()) - pg_catalog.make_interval(days => greatest(v_days - 1, 29)) as event_start_at,
      pg_catalog.date_trunc('day', pg_catalog.now()) as end_at
  ),
  days as (
    select pg_catalog.generate_series(b.series_start_at, b.end_at, interval '1 day') as day
    from bounds b
  ),
  activity_events as (
    select p.created_at, p.author_id as user_id, 'post'::text as kind,
           (p.section = 'daily') as is_daily
      from public.posts p, bounds b
     where p.created_at >= b.event_start_at and p.deleted_at is null
    union all
    select c.created_at, c.author_id, 'comment', false
      from public.comments c, bounds b
     where c.created_at >= b.event_start_at and c.deleted_at is null
    union all
    select a.created_at, a.uploaded_by, 'photo', false
      from public.album_photos a, bounds b
     where a.created_at >= b.event_start_at
    union all
    select m.created_at, m.sender_id, 'message', false
      from public.messages m, bounds b
     where m.created_at >= b.event_start_at
    union all
    select l.created_at, l.author_id, 'love_wall', false
      from public.love_wall_posts l, bounds b
     where l.created_at >= b.event_start_at
    union all
    select s.created_at, s.author_id, 'song', false
      from public.song_posts s, bounds b
     where s.created_at >= b.event_start_at
    union all
    select bm.created_at, bm.author_id, 'board_message', false
      from public.board_messages bm, bounds b
     where bm.created_at >= b.event_start_at and not bm.is_admin_msg
  ),
  daily_activity as (
    select
      pg_catalog.date_trunc('day', e.created_at) as day,
      count(*) filter (where e.kind = 'post')::integer as posts,
      count(*) filter (where e.is_daily)::integer as daily_posts,
      count(*) filter (where e.kind = 'comment')::integer as comments,
      count(*) filter (where e.kind = 'photo')::integer as photos,
      count(*) filter (where e.kind = 'message')::integer as chat_messages,
      count(*) filter (where e.kind = 'love_wall')::integer as love_wall_posts,
      count(*) filter (where e.kind = 'song')::integer as song_posts,
      count(*) filter (where e.kind = 'board_message')::integer as board_messages,
      count(distinct e.user_id)::integer as content_active_members
    from activity_events e
    group by 1
  ),
  daily_signups as (
    select pg_catalog.date_trunc('day', p.created_at) as day, count(*)::integer as signups
      from public.profiles p, bounds b
     where p.created_at >= b.series_start_at
     group by 1
  ),
  daily_series as (
    select
      d.day,
      coalesce(s.signups, 0) as signups,
      coalesce(a.posts, 0) as posts,
      coalesce(a.daily_posts, 0) as daily_posts,
      coalesce(a.comments, 0) as comments,
      coalesce(a.photos, 0) as photos,
      coalesce(a.chat_messages, 0) as chat_messages,
      coalesce(a.love_wall_posts, 0) as love_wall_posts,
      coalesce(a.song_posts, 0) as song_posts,
      coalesce(a.board_messages, 0) as board_messages,
      coalesce(a.content_active_members, 0) as content_active_members
    from days d
    left join daily_signups s on s.day = d.day
    left join daily_activity a on a.day = d.day
  )
  select pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'days', v_days,
    'totals', pg_catalog.jsonb_build_object(
      'members', (select count(*) from public.profiles),
      'joined_members', (select count(*) from public.profiles where joined),
      'admins', (select count(*) from public.profiles where role in ('admin', 'super_admin')),
      'new_members_7d', (select count(*) from public.profiles where created_at >= pg_catalog.now() - interval '7 days'),
      'new_members_30d', (select count(*) from public.profiles where created_at >= pg_catalog.now() - interval '30 days'),
      'posts', (select count(*) from public.posts where deleted_at is null),
      'daily_posts', (select count(*) from public.posts where section = 'daily' and deleted_at is null),
      'comments', (select count(*) from public.comments where deleted_at is null),
      'photos', (select count(*) from public.album_photos),
      'chat_messages', (select count(*) from public.messages),
      'love_wall_posts', (select count(*) from public.love_wall_posts),
      'song_posts', (select count(*) from public.song_posts),
      'board_messages', (select count(*) from public.board_messages where not is_admin_msg),
      'reports', (select count(*) from public.reports),
      'content_active_7d', (
        select count(distinct e.user_id) from activity_events e
        where e.created_at >= pg_catalog.now() - interval '7 days'
      ),
      'content_active_30d', (
        select count(distinct e.user_id) from activity_events e
        where e.created_at >= pg_catalog.now() - interval '30 days'
      )
    ),
    'series', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'day', s.day,
          'signups', s.signups,
          'posts', s.posts,
          'daily_posts', s.daily_posts,
          'comments', s.comments,
          'photos', s.photos,
          'chat_messages', s.chat_messages,
          'love_wall_posts', s.love_wall_posts,
          'song_posts', s.song_posts,
          'board_messages', s.board_messages,
          'content_active_members', s.content_active_members
        ) order by s.day
      )
      from daily_series s
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_analytics_overview(integer) from public, anon;
grant execute on function public.admin_analytics_overview(integer) to authenticated;

commit;
