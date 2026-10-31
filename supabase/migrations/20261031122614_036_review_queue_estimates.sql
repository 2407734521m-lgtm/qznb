-- 036_review_queue_estimates
-- 目的：让成员能看到自己待审投稿的排队位置与管理员活跃状态，用于前端显示预计审核时间。
-- 背景：love_wall_posts / song_posts / game_profiles 的 SELECT 策略只允许本人或管理员读取，
--       普通成员无法直接统计队列前方人数，必须由 SECURITY DEFINER 函数只返回聚合数字。
-- 隐私：函数只返回调用者本人待审条目的 id/时间/前方条数/队列总数，以及“是否有管理员近5分钟活跃”布尔值；
--       不返回任何他人的内容、姓名或账号信息。
-- 影响：纯新增一个只读函数，不改表、不改数据。回滚：drop function public.my_review_estimates();

create or replace function public.my_review_estimates()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_admin_active boolean := false;
  v_items jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.member_presence mp
    join public.profiles p on p.id = mp.profile_id
    where p.role in ('admin', 'super_admin')
      and mp.updated_at >= pg_catalog.now() - interval '5 minutes'
  ) into v_admin_active;

  select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_items
  from (
    select pg_catalog.jsonb_build_object(
      'kind', 'love_wall',
      'id', t.id,
      'created_at', t.created_at,
      'ahead', (select count(*) from public.love_wall_posts q
                where q.status = 'pending' and (q.created_at, q.id) < (t.created_at, t.id)),
      'total', (select count(*) from public.love_wall_posts q where q.status = 'pending')
    ) as item
    from public.love_wall_posts t
    where t.author_id = v_uid and t.status = 'pending'

    union all

    select pg_catalog.jsonb_build_object(
      'kind', 'song',
      'id', t.id,
      'created_at', t.created_at,
      'ahead', (select count(*) from public.song_posts q
                where q.status = 'pending' and (q.created_at, q.id) < (t.created_at, t.id)),
      'total', (select count(*) from public.song_posts q where q.status = 'pending')
    )
    from public.song_posts t
    where t.author_id = v_uid and t.status = 'pending'

    union all

    select pg_catalog.jsonb_build_object(
      'kind', 'game',
      'id', t.id,
      'created_at', t.created_at,
      'ahead', (select count(*) from public.game_profiles q
                where q.status = 'pending' and (q.created_at, q.id) < (t.created_at, t.id)),
      'total', (select count(*) from public.game_profiles q where q.status = 'pending')
    )
    from public.game_profiles t
    where t.profile_id = v_uid and t.status = 'pending'
  ) s;

  return pg_catalog.jsonb_build_object(
    'admin_active', v_admin_active,
    'items', v_items,
    'sampled_at', pg_catalog.now()
  );
end;
$$;

revoke execute on function public.my_review_estimates() from public;
revoke execute on function public.my_review_estimates() from anon;
grant execute on function public.my_review_estimates() to authenticated;
