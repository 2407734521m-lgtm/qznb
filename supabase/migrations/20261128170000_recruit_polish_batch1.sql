-- 20261128170000_recruit_polish_batch1.sql
-- 招聘优化第一批：面试安排 + 批量审核 + 进度查询返回面试信息。
-- 只新增列与函数，不动现有数据；所有新 RPC 均为 SECURITY DEFINER，
-- search_path 固定为空，调用者权限在函数体内校验（仅超管）。
-- 回滚：drop 新的两个函数、把 admin_review_recruit_application 恢复为
-- 三参版本、把两个列表函数恢复为旧返回列、删面试列。

begin;

-- 面试时间与说明（通过后由后台填写）。
alter table public.recruit_applications
  add column if not exists interview_at timestamptz,
  add column if not exists interview_note text not null default '';

-- 审核：通过时可一并记面试时间与说明（仅 approved 生效；驳回忽略）。
-- 旧版是三参函数，先删再建；后两个参数有默认值，旧的三参调用仍能跑。
drop function if exists public.admin_review_recruit_application(bigint, text, text);
create or replace function public.admin_review_recruit_application(
  p_id bigint, p_status text, p_note text default '',
  p_interview_at timestamptz default null, p_interview_note text default ''
)
returns table(id bigint, position_id bigint, position_title text, name text, qq_email text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_position_id bigint;
  v_name text;
  v_email text;
  v_current text;
  v_quota integer;
  v_approved bigint;
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'bad status'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'bad note'; end if;
  if length(coalesce(p_interview_note, '')) > 500 then raise exception 'bad note'; end if;
  select a.position_id, a.name, a.qq_email, a.status
  into v_position_id, v_name, v_email, v_current
  from public.recruit_applications a where a.id = p_id for update;
  if not found then raise exception 'application not found'; end if;
  if v_current <> 'pending' then raise exception 'already reviewed'; end if;
  if p_status = 'approved' then
    -- 注意：本函数 RETURNS TABLE 里有 id / status 输出列，与表列同名，
    -- 下面所有列引用必须加表别名限定，否则 PL/pgSQL 报 42702 歧义。
    select p.quota into v_quota from public.recruit_positions p where p.id = v_position_id for update;
    if not found then raise exception 'position not found'; end if;
    select count(*) into v_approved
    from public.recruit_applications a
    where a.position_id = v_position_id and a.status = 'approved';
    if v_approved >= v_quota then raise exception 'position full'; end if;
  end if;
  update public.recruit_applications a
  set status = p_status, admin_note = btrim(coalesce(p_note, '')),
    reviewed_at = now(), reviewed_by = auth.uid(),
    interview_at = case when p_status = 'approved' then p_interview_at else a.interview_at end,
    interview_note = case when p_status = 'approved' then btrim(coalesce(p_interview_note, '')) else a.interview_note end
  where a.id = p_id;
  return query select p_id, v_position_id,
    (select r.title from public.recruit_positions r where r.id = v_position_id),
    v_name, v_email, p_status;
end $$;
revoke all on function public.admin_review_recruit_application(bigint, text, text, timestamptz, text) from public;
grant execute on function public.admin_review_recruit_application(bigint, text, text, timestamptz, text) to authenticated;

-- 通过后补填 / 修改面试时间（仅已通过的申请；传 null 可清除）。
create or replace function public.admin_set_recruit_interview(
  p_id bigint, p_interview_at timestamptz, p_interview_note text default ''
)
returns table(id bigint, interview_at timestamptz, interview_note text)
language plpgsql security definer set search_path = '' as $$
declare
  v_current text;
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if length(coalesce(p_interview_note, '')) > 500 then raise exception 'bad note'; end if;
  select a.status into v_current from public.recruit_applications a where a.id = p_id for update;
  if not found then raise exception 'application not found'; end if;
  if v_current <> 'approved' then raise exception 'not approved'; end if;
  update public.recruit_applications a
  set interview_at = p_interview_at, interview_note = btrim(coalesce(p_interview_note, ''))
  where a.id = p_id;
  return query select p_id, p_interview_at, btrim(coalesce(p_interview_note, ''));
end $$;
revoke all on function public.admin_set_recruit_interview(bigint, timestamptz, text) from public;
grant execute on function public.admin_set_recruit_interview(bigint, timestamptz, text) to authenticated;

-- 批量审核：按传入顺序逐份处理，每份都走和单个审核一样的加锁数人数逻辑。
-- 名额满了的那份及之后同职位的份记为 full 并跳过，不超员；已审核过的记为 skipped。
-- 返回 jsonb：{processed, skipped, stopped_full, results: [{id, result}]}。
create or replace function public.admin_review_recruit_applications_batch(
  p_ids bigint[], p_status text, p_note text default ''
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_position_id bigint;
  v_current text;
  v_quota integer;
  v_approved bigint;
  v_processed integer := 0;
  v_skipped integer := 0;
  v_full_positions bigint[] := '{}';
  v_results jsonb := '[]'::jsonb;
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'bad status'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'bad note'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'bad ids'; end if;
  if cardinality(p_ids) > 100 then raise exception 'bad ids'; end if;

  foreach v_id in array p_ids loop
    select a.position_id, a.status into v_position_id, v_current
    from public.recruit_applications a where a.id = v_id for update;
    if not found or v_current <> 'pending' then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'result', 'skipped');
      continue;
    end if;
    if p_status = 'approved' then
      if v_position_id = any (v_full_positions) then
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object('id', v_id, 'result', 'full');
        continue;
      end if;
      select p.quota into v_quota from public.recruit_positions p where p.id = v_position_id for update;
      if not found then
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object('id', v_id, 'result', 'skipped');
        continue;
      end if;
      select count(*) into v_approved
      from public.recruit_applications a
      where a.position_id = v_position_id and a.status = 'approved';
      if v_approved >= v_quota then
        v_full_positions := array_append(v_full_positions, v_position_id);
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object('id', v_id, 'result', 'full');
        continue;
      end if;
    end if;
    update public.recruit_applications a
    set status = p_status, admin_note = btrim(coalesce(p_note, '')),
      reviewed_at = now(), reviewed_by = auth.uid()
    where a.id = v_id;
    v_processed := v_processed + 1;
    v_results := v_results || jsonb_build_object('id', v_id, 'result', 'done');
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'skipped', v_skipped,
    'stopped_full', cardinality(v_full_positions) > 0,
    'results', v_results
  );
end $$;
revoke all on function public.admin_review_recruit_applications_batch(bigint[], text, text) from public;
grant execute on function public.admin_review_recruit_applications_batch(bigint[], text, text) to authenticated;

-- 进度查询返回里加面试时间与说明。
drop function if exists public.recruit_my_applications(text);
create or replace function public.recruit_my_applications(p_qq_email text)
returns table(id bigint, position_id bigint, position_title text, status text, created_at timestamptz, reviewed_at timestamptz, admin_note text, interview_at timestamptz, interview_note text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.position_id, p.title, a.status, a.created_at, a.reviewed_at, a.admin_note, a.interview_at, a.interview_note
  from public.recruit_applications a
  join public.recruit_positions p on p.id = a.position_id
  where a.qq_email = lower(btrim(coalesce(p_qq_email, '')))
  order by a.created_at desc
  limit 50;
$$;
revoke all on function public.recruit_my_applications(text) from public;
grant execute on function public.recruit_my_applications(text) to anon, authenticated;

-- 后台申请列表返回里加面试时间与说明。
drop function if exists public.admin_list_recruit_applications(bigint, text, integer);
create or replace function public.admin_list_recruit_applications(
  p_position_id bigint default null, p_status text default null, p_limit integer default 100
)
returns table(
  id bigint, created_at timestamptz, position_id bigint, position_title text,
  name text, qq_email text, phone text, intro text, experience text,
  status text, admin_note text, reviewed_at timestamptz,
  email_sent_at timestamptz, email_status text,
  interview_at timestamptz, interview_note text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.created_at, a.position_id, p.title,
    a.name, a.qq_email, a.phone, a.intro, a.experience,
    a.status, a.admin_note, a.reviewed_at, a.email_sent_at, a.email_status,
    a.interview_at, a.interview_note
  from public.recruit_applications a
  join public.recruit_positions p on p.id = a.position_id
  where public.my_role() = 'super_admin'
    and (p_position_id is null or a.position_id = p_position_id)
    and (p_status is null or p_status = '' or a.status = p_status)
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;
revoke all on function public.admin_list_recruit_applications(bigint, text, integer) from public;
grant execute on function public.admin_list_recruit_applications(bigint, text, integer) to authenticated;

commit;
