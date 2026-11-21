-- 20261121094000_audit_phase4_null_role_guard.sql
-- 第 4 阶段审计 B 线 S7：四个管理员函数仍用旧式 NULL-role 写法
--   if ... public.my_role() <> 'super_admin' then raise ...
-- my_role() 返回 NULL 时该条件为 NULL、IF 不触发拒绝，理论上可绕过
-- （当前 auth.users 无资料行者为 0，暂不可利用，属潜伏写法问题）。
-- 本迁移只把守卫改成与 010_admin_role_null_guard.sql 一致的
-- IS NULL OR 写法，其余逻辑逐字保留；对所有真实账号行为不变。
-- 四个函数的完整定义取自生产库 pg_get_functiondef（2026-11-21 实测）。
-- 回滚：用旧定义重新 CREATE OR REPLACE 即可（旧定义见 git 历史中的
-- 20261101013800_member_discipline_moderation.sql）。


-- admin_member_moderation：只改守卫，其余逐字保留。
CREATE OR REPLACE FUNCTION public.admin_member_moderation(p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or (public.my_role() is null or public.my_role() <> 'super_admin') then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_target_user_id is null
     or not exists (
       select 1 from public.profiles p where p.id = p_target_user_id
     ) then
    raise exception 'target member not found' using errcode = '22023';
  end if;

  select pg_catalog.jsonb_build_object(
    'target_user_id', p_target_user_id,
    'actions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', a.id,
          'action_type', a.action_type,
          'reason', a.reason,
          'created_at', a.created_at,
          'expires_at', a.expires_at,
          'revoked_at', a.revoked_at,
          'revocation_reason', a.revocation_reason,
          'active', (
            a.action_type <> 'warning'
            and a.revoked_at is null
            and (a.expires_at is null or a.expires_at > pg_catalog.now())
          ),
          'actor_name', coalesce(actor.display_name, actor.username::text, '管理员'),
          'revoked_by_name', coalesce(revoker.display_name, revoker.username::text)
        )
        order by a.created_at desc
      )
      from admin_private.member_moderation_actions a
      left join public.profiles actor on actor.id = a.actor_id
      left join public.profiles revoker on revoker.id = a.revoked_by
      where a.target_user_id = p_target_user_id
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

-- admin_apply_member_moderation：只改守卫，其余逐字保留。
CREATE OR REPLACE FUNCTION public.admin_apply_member_moderation(p_target_user_id uuid, p_action_type text, p_reason text, p_duration_hours integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target_role text;
  v_expires_at timestamptz;
  v_action_id uuid;
begin
  if v_actor is null or (public.my_role() is null or public.my_role() <> 'super_admin') then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_target_user_id is null
     or p_target_user_id = v_actor
     or p_action_type is null
     or p_action_type not in ('warning', 'community_mute', 'chat_mute', 'interaction_suspend')
     or p_reason is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 8
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 500 then
    raise exception 'invalid moderation request' using errcode = '22023';
  end if;

  select p.role
    into v_target_role
    from public.profiles p
   where p.id = p_target_user_id
   for update;

  if not found then
    raise exception 'target member not found' using errcode = '22023';
  end if;

  if v_target_role <> 'member' then
    raise exception 'moderation actions can only target regular members' using errcode = '42501';
  end if;

  if p_action_type = 'warning' then
    if p_duration_hours is not null then
      raise exception 'warnings do not have a duration' using errcode = '22023';
    end if;
    v_expires_at := null;
  else
    if p_duration_hours is not null
       and p_duration_hours not in (1, 24, 72, 168) then
      raise exception 'unsupported moderation duration' using errcode = '22023';
    end if;
    v_expires_at := case
      when p_duration_hours is null then null
      else pg_catalog.now() + pg_catalog.make_interval(hours => p_duration_hours)
    end;
  end if;

  insert into admin_private.member_moderation_actions (
    target_user_id, actor_id, action_type, reason, expires_at
  ) values (
    p_target_user_id, v_actor, p_action_type, pg_catalog.btrim(p_reason), v_expires_at
  )
  returning id into v_action_id;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'member_moderation_applied',
    p_target_user_id,
    pg_catalog.jsonb_build_object(
      'moderation_id', v_action_id,
      'action_type', p_action_type,
      'duration_hours', p_duration_hours,
      'expires_at', v_expires_at,
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  insert into public.notifications(profile_id, type, title, body, link, is_read)
  values (
    p_target_user_id,
    'moderation',
    case p_action_type
      when 'warning' then '管理员警告'
      when 'community_mute' then '社区禁言已生效'
      when 'chat_mute' then '私聊禁言已生效'
      else '全站互动限制已生效'
    end,
    '处理原因：' || pg_catalog.btrim(p_reason) || E'\n' ||
    case
      when p_action_type = 'warning' then '这是一条警告记录，不会限制你的使用功能。'
      when v_expires_at is null then '限制期限：长期，直到管理员手动解除。'
      else '限制截止：' || pg_catalog.to_char(v_expires_at, 'YYYY-MM-DD HH24:MI:SS')
    end,
    null,
    false
  );

  return v_action_id;
end;
$function$;

-- admin_revoke_member_moderation：只改守卫，其余逐字保留。
CREATE OR REPLACE FUNCTION public.admin_revoke_member_moderation(p_action_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target_user_id uuid;
  v_action_type text;
begin
  if v_actor is null or (public.my_role() is null or public.my_role() <> 'super_admin') then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_action_id is null
     or p_reason is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 8
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 300 then
    raise exception 'invalid moderation release request' using errcode = '22023';
  end if;

  select a.target_user_id, a.action_type
    into v_target_user_id, v_action_type
    from admin_private.member_moderation_actions a
   where a.id = p_action_id
     and a.action_type <> 'warning'
     and a.revoked_at is null
     and (a.expires_at is null or a.expires_at > pg_catalog.now())
   for update;

  if not found then
    raise exception 'active moderation restriction not found' using errcode = '22023';
  end if;

  update admin_private.member_moderation_actions
     set revoked_at = pg_catalog.now(),
         revoked_by = v_actor,
         revocation_reason = pg_catalog.btrim(p_reason)
   where id = p_action_id;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'member_moderation_revoked',
    v_target_user_id,
    pg_catalog.jsonb_build_object(
      'moderation_id', p_action_id,
      'action_type', v_action_type,
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  insert into public.notifications(profile_id, type, title, body, link, is_read)
  values (
    v_target_user_id,
    'moderation',
    '成员互动限制已解除',
    '已解除的处理类型：' || v_action_type || E'\n' ||
    '解除原因：' || pg_catalog.btrim(p_reason),
    null,
    false
  );
end;
$function$;

-- admin_member_activity：只改守卫，其余逐字保留。
CREATE OR REPLACE FUNCTION public.admin_member_activity(p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or (public.my_role() is null or public.my_role() <> 'super_admin') then
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
