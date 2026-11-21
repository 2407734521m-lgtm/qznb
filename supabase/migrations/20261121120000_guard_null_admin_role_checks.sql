-- Close NULL-role fall-through in three super-admin-only SECURITY DEFINER RPCs.
-- In SQL, NULL <> 'super_admin' evaluates to NULL, and IF NULL does not enter
-- the rejection branch. Coalesce the role lookup to an empty string.

begin;

CREATE OR REPLACE FUNCTION public.admin_analytics_overview(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer := coalesce(p_days, 30);
  v_result jsonb;
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
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

CREATE OR REPLACE FUNCTION public.admin_backup_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'database_size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'public_table_count', (
      select count(*) from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    ),
    'storage_buckets', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'bucket_id', b.id,
          'is_public', b.public,
          'object_count', coalesce(x.object_count, 0),
          'total_bytes', coalesce(x.total_bytes, 0)
        ) order by b.id
      )
      from storage.buckets b
      left join (
        select
          o.bucket_id,
          count(*)::bigint as object_count,
          coalesce(sum(
            case
              when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint
              else 0
            end
          ), 0)::bigint as total_bytes
        from storage.objects o
        group by o.bucket_id
      ) x on x.bucket_id = b.id
    ), '[]'::jsonb),
    'manual_backup_count', (select count(*) from public.backup_logs),
    'latest_manual_backup_at', (select max(created_at) from public.backup_logs),
    'manual_backup_logs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', l.id,
          'scope', l.scope,
          'status', l.status,
          'note', l.note,
          'created_at', l.created_at,
          'created_by_name', coalesce(nullif(p.display_name, ''), p.username, '超级管理员')
        ) order by l.created_at desc
      )
      from (
        select * from public.backup_logs order by created_at desc limit 20
      ) l
      left join public.profiles p on p.id = l.created_by
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_record_manual_backup(p_scope text, p_note text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_id bigint;
begin
  if v_actor is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_scope is null or p_scope not in ('database', 'storage', 'full')
     or p_note is null
     or pg_catalog.char_length(pg_catalog.btrim(p_note)) < 8
     or pg_catalog.char_length(pg_catalog.btrim(p_note)) > 500 then
    raise exception 'invalid manual backup record';
  end if;

  insert into public.backup_logs(created_by, scope, status, note)
  values (v_actor, p_scope, 'manual_verified', pg_catalog.btrim(p_note))
  returning id into v_id;

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'manual_backup_attested',
    pg_catalog.jsonb_build_object('backup_log_id', v_id, 'scope', p_scope)
  );

  return v_id;
end;
$function$;

commit;
