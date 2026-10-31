-- Super-admin-only member activity timeline.
-- Exposes coarse session counts and event metadata only; never returns session
-- tokens, IP addresses, user agents, post/comment bodies, or audit detail.

begin;

create or replace function public.admin_member_activity(p_target uuid)
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
  if p_target is null then
    raise exception 'target account required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'target account not found';
  end if;

  with
  profile_data as (
    select p.created_at
    from public.profiles p
    where p.id = p_target
  ),
  session_data as (
    select
      count(*) filter (where s.not_after is null or s.not_after > pg_catalog.now())::integer as active_sessions,
      max(s.updated_at) as latest_session_at
    from auth.sessions s
    where s.user_id = p_target
  ),
  content_counts as (
    select
      (select count(*) from public.posts p where p.author_id = p_target)::integer as posts,
      (select count(*) from public.comments c where c.author_id = p_target)::integer as comments,
      (select count(*) from public.album_photos a where a.uploaded_by = p_target)::integer as photos,
      (select count(*) from public.board_messages b where b.author_id = p_target and not b.is_admin_msg)::integer as board_messages,
      (select count(*) from public.reports r where r.reporter_id = p_target)::integer as reports_submitted,
      (select count(*) from public.admin_audit_logs l where l.target = p_target)::integer as moderation_actions
  ),
  events as (
    select '账号注册'::text as event_type, pd.created_at as happened_at, '完成账号创建'::text as summary
    from profile_data pd
    union all
    select '最近登录', u.last_sign_in_at, '认证服务记录的最近登录时间'
    from auth.users u
    where u.id = p_target and u.last_sign_in_at is not null
    union all
    select '发布动态', p.created_at, '社区动态'
    from public.posts p
    where p.author_id = p_target
    union all
    select '发表评论', c.created_at, '社区评论'
    from public.comments c
    where c.author_id = p_target
    union all
    select '上传照片', a.created_at, '相册照片'
    from public.album_photos a
    where a.uploaded_by = p_target
    union all
    select '发布留言', b.created_at, '普通留言'
    from public.board_messages b
    where b.author_id = p_target and not b.is_admin_msg
    union all
    select '提交举报', r.created_at, '提交了一条内容举报'
    from public.reports r
    where r.reporter_id = p_target
    union all
    select '管理员处理', l.created_at, l.action
    from public.admin_audit_logs l
    where l.target = p_target
  )
  select pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'sessions', pg_catalog.jsonb_build_object(
      'active_count', sd.active_sessions,
      'latest_activity_at', sd.latest_session_at
    ),
    'counts', pg_catalog.to_jsonb(cc),
    'timeline', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'event_type', e.event_type,
          'happened_at', e.happened_at,
          'summary', e.summary
        ) order by e.happened_at desc
      )
      from (select * from events order by happened_at desc limit 30) e
    ), '[]'::jsonb)
  )
  into v_result
  from session_data sd
  cross join content_counts cc;

  return v_result;
end;
$function$;

revoke all on function public.admin_member_activity(uuid) from public, anon;
grant execute on function public.admin_member_activity(uuid) to authenticated;

commit;
