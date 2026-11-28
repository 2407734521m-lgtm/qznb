-- 20261128200000_recruit_position_holders.sql
-- 招聘任职人改为数据库字段：recruit_positions 新增 holder_names（任职人姓名数组）。
-- 之前 5 个满员职位的任职人只写在前端静态映射 FILLED_POSITIONS 里，后台改不了，
-- 后台的“还剩几人”也只按已通过申请数算，满员职位仍显示“还剩 1 人”。
-- 改后：任职人存在库里，后台职位编辑页可改；名额一律按“已通过申请数 + 任职人数”
-- 算已占，剩余 = 名额 − 已占（最小为 0），满员后提交与审核通过都在服务端拒绝。
-- 回滚：drop column holder_names，并把下面四个函数恢复为
-- 20261128140000 / 20261128170000 里的旧版本（名额只按已通过申请数算）。

begin;

alter table public.recruit_positions
  add column if not exists holder_names text[] not null default '{}';

-- seed 现有的 5 个满员职位（只在任职人为空时写，不覆盖后台已改过的值）。
-- 用户名单里写的是“财务经理”，招聘职位名叫“财务总监”，是同一个财务负责人职位。
update public.recruit_positions set holder_names = array['王瑞']
  where title = '董事长' and holder_names = '{}';
update public.recruit_positions set holder_names = array['刘俊威']
  where title = '总经理' and holder_names = '{}';
update public.recruit_positions set holder_names = array['谢铭辛']
  where title = '人事经理' and holder_names = '{}';
update public.recruit_positions set holder_names = array['陈泽洋']
  where title = '财务总监' and holder_names = '{}';
update public.recruit_positions set holder_names = array['李柯', '严浩溢']
  where title = '保安' and holder_names = '{}';

-- 游客提交申请：满员判断把任职人算进去。
create or replace function public.submit_recruit_application(
  p_position_id bigint, p_name text, p_qq_email text,
  p_phone text default '', p_intro text default '', p_experience text default ''
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_quota integer;
  v_is_open boolean;
  v_approved bigint;
  v_holders integer;
  v_id bigint;
begin
  if p_position_id is null then raise exception 'bad position'; end if;
  p_name := btrim(coalesce(p_name, ''));
  p_qq_email := lower(btrim(coalesce(p_qq_email, '')));
  p_phone := btrim(coalesce(p_phone, ''));
  p_intro := btrim(coalesce(p_intro, ''));
  p_experience := btrim(coalesce(p_experience, ''));
  if p_name = '' or length(p_name) > 20 then raise exception 'bad name'; end if;
  if p_qq_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(p_qq_email) > 254 then raise exception 'bad email'; end if;
  if length(p_phone) > 20 then raise exception 'bad phone'; end if;
  if length(p_intro) > 2000 or length(p_experience) > 2000 then raise exception 'bad text'; end if;
  select quota, is_open, coalesce(array_length(holder_names, 1), 0)
    into v_quota, v_is_open, v_holders
  from public.recruit_positions where id = p_position_id;
  if not found or not v_is_open then raise exception 'position closed'; end if;
  select count(*) into v_approved
  from public.recruit_applications
  where position_id = p_position_id and status = 'approved';
  if v_approved + v_holders >= v_quota then raise exception 'position full'; end if;
  if exists (
    select 1 from public.recruit_applications
    where position_id = p_position_id and qq_email = p_qq_email and status in ('pending', 'approved')
  ) then raise exception 'already applied'; end if;
  insert into public.recruit_applications(position_id, name, qq_email, phone, intro, experience)
  values (p_position_id, p_name, p_qq_email, p_phone, p_intro, p_experience)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_recruit_application(bigint, text, text, text, text, text) from public;
grant execute on function public.submit_recruit_application(bigint, text, text, text, text, text) to anon, authenticated;

-- 审核通过：满员判断把任职人算进去（其余逻辑与 20261128170000 的五参版本一致）。
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
  v_holders integer;
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
    select p.quota, coalesce(array_length(p.holder_names, 1), 0)
      into v_quota, v_holders
    from public.recruit_positions p where p.id = v_position_id for update;
    if not found then raise exception 'position not found'; end if;
    select count(*) into v_approved
    from public.recruit_applications a
    where a.position_id = v_position_id and a.status = 'approved';
    if v_approved + v_holders >= v_quota then raise exception 'position full'; end if;
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

-- 批量审核：满员判断把任职人算进去。
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
  v_holders integer;
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
      select p.quota, coalesce(array_length(p.holder_names, 1), 0)
        into v_quota, v_holders
      from public.recruit_positions p where p.id = v_position_id for update;
      if not found then
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object('id', v_id, 'result', 'skipped');
        continue;
      end if;
      select count(*) into v_approved
      from public.recruit_applications a
      where a.position_id = v_position_id and a.status = 'approved';
      if v_approved + v_holders >= v_quota then
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

-- 后台职位列表：返回里加 holder_names（返回列变了，先删再建）。
drop function if exists public.admin_list_recruit_positions();
create or replace function public.admin_list_recruit_positions()
returns table(
  id bigint, created_at timestamptz, title text, department text, quota integer,
  salary_min integer, salary_max integer, description text, requirements text,
  is_open boolean, sort_order integer,
  approved_count bigint, pending_count bigint, total_count bigint,
  holder_names text[]
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.created_at, p.title, p.department, p.quota, p.salary_min, p.salary_max,
    p.description, p.requirements, p.is_open, p.sort_order,
    count(a.id) filter (where a.status = 'approved'),
    count(a.id) filter (where a.status = 'pending'),
    count(a.id),
    p.holder_names
  from public.recruit_positions p
  left join public.recruit_applications a on a.position_id = p.id
  where public.my_role() = 'super_admin'
  group by p.id
  order by p.sort_order, p.id;
$$;
revoke all on function public.admin_list_recruit_positions() from public;
grant execute on function public.admin_list_recruit_positions() to authenticated;

-- 后台新增 / 编辑职位：加任职人参数（有默认值，旧的十参调用仍能跑；
-- 签名变了，先删旧版再建）。任职人去空去重，每人 20 字以内，最多 100 人。
drop function if exists public.admin_upsert_recruit_position(bigint, text, text, integer, integer, integer, text, text, boolean, integer);
create or replace function public.admin_upsert_recruit_position(
  p_id bigint, p_title text, p_department text, p_quota integer,
  p_salary_min integer, p_salary_max integer,
  p_description text, p_requirements text, p_is_open boolean, p_sort_order integer,
  p_holder_names text[] default '{}'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  p_title := btrim(coalesce(p_title, ''));
  p_department := btrim(coalesce(p_department, ''));
  if p_title = '' or length(p_title) > 30 then raise exception 'bad title'; end if;
  if p_department = '' or length(p_department) > 20 then raise exception 'bad department'; end if;
  if p_quota is null or p_quota < 0 or p_quota > 100 then raise exception 'bad quota'; end if;
  if p_salary_min is not null and p_salary_min < 0 then raise exception 'bad salary'; end if;
  if p_salary_max is not null and p_salary_max < 0 then raise exception 'bad salary'; end if;
  if p_salary_min is not null and p_salary_max is not null and p_salary_min > p_salary_max then raise exception 'bad salary'; end if;
  if length(coalesce(p_description, '')) > 2000 or length(coalesce(p_requirements, '')) > 2000 then raise exception 'bad text'; end if;
  if p_holder_names is null then p_holder_names := '{}'; end if;
  if exists (select 1 from unnest(p_holder_names) v where length(btrim(v)) > 20) then raise exception 'bad holders'; end if;
  if cardinality(p_holder_names) > 100 then raise exception 'bad holders'; end if;
  select coalesce(array_agg(x), '{}') into p_holder_names
  from (select distinct btrim(v) as x from unnest(p_holder_names) v where btrim(v) <> '') s;
  if p_id is null then
    insert into public.recruit_positions(title, department, quota, salary_min, salary_max, description, requirements, is_open, sort_order, holder_names)
    values (p_title, p_department, p_quota, p_salary_min, p_salary_max,
      coalesce(p_description, ''), coalesce(p_requirements, ''), coalesce(p_is_open, true), coalesce(p_sort_order, 0), p_holder_names)
    returning id into v_id;
  else
    update public.recruit_positions set
      title = p_title, department = p_department, quota = p_quota,
      salary_min = p_salary_min, salary_max = p_salary_max,
      description = coalesce(p_description, ''), requirements = coalesce(p_requirements, ''),
      is_open = coalesce(p_is_open, true), sort_order = coalesce(p_sort_order, 0),
      holder_names = p_holder_names,
      updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'position not found'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.admin_upsert_recruit_position(bigint, text, text, integer, integer, integer, text, text, boolean, integer, text[]) from public;
grant execute on function public.admin_upsert_recruit_position(bigint, text, text, integer, integer, integer, text, text, boolean, integer, text[]) to authenticated;

-- 后台统计：开放职位数只计还有名额的（任职人占满的职位不再算开放）。
create or replace function public.admin_recruit_stats()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'total_positions', (select count(*) from public.recruit_positions),
    'open_positions', (
      select count(*) from public.recruit_positions p
      where p.is_open
        and (select count(*) from public.recruit_applications a where a.position_id = p.id and a.status = 'approved')
          + coalesce(array_length(p.holder_names, 1), 0) < p.quota
    ),
    'total_applications', (select count(*) from public.recruit_applications),
    'pending', (select count(*) from public.recruit_applications where status = 'pending'),
    'approved', (select count(*) from public.recruit_applications where status = 'approved'),
    'rejected', (select count(*) from public.recruit_applications where status = 'rejected'),
    'by_position', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'position_id', position_id, 'title', title, 'quota', quota,
        'approved', approved, 'pending', pending, 'total', total
      ) order by sort_order, position_id)
      from (
        select p.id as position_id, p.title, p.quota, p.sort_order,
          count(a.id) filter (where a.status = 'approved') as approved,
          count(a.id) filter (where a.status = 'pending') as pending,
          count(a.id) as total
        from public.recruit_positions p
        left join public.recruit_applications a on a.position_id = p.id
        group by p.id
      ) s
    ), '[]'::jsonb)
  )
  where public.my_role() = 'super_admin';
$$;
revoke all on function public.admin_recruit_stats() from public;
grant execute on function public.admin_recruit_stats() to authenticated;

commit;
