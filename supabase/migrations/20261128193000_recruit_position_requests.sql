-- 20261128193000_recruit_position_requests.sql
-- 招聘页「申请新增岗位」：访客可以申请加一个新岗位，后台审核通过后
-- 自动在 recruit_positions 里建出该职位（名额默认 1 人，开放招聘）。
-- 写路径一律走 SECURITY DEFINER 的 RPC；表本身不对客户端开放。
-- 回滚：先 drop 三个新函数，再 drop table public.recruit_position_requests。

begin;

create table if not exists public.recruit_position_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  title text not null,
  department text not null default '综合',
  salary_min integer check (salary_min is null or salary_min >= 0),
  salary_max integer check (salary_max is null or salary_max >= 0),
  description text not null default '',
  qq_email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_position_id bigint references public.recruit_positions(id) on delete set null,
  check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create index if not exists recruit_position_requests_status_created_idx
  on public.recruit_position_requests(status, created_at desc);
create index if not exists recruit_position_requests_title_idx
  on public.recruit_position_requests(lower(title));

alter table public.recruit_position_requests enable row level security;

revoke all on table public.recruit_position_requests from public, anon, authenticated;

-- 游客提交新增岗位申请：校验输入；同名岗位已在职位表里、或同名申请
-- 还在待审，都直接拒绝并给原因，不重复建申请。
create or replace function public.submit_recruit_position_request(
  p_title text, p_department text default '综合',
  p_salary_min integer default null, p_salary_max integer default null,
  p_description text default '', p_qq_email text default ''
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_department text;
  v_email text;
  v_description text;
  v_id bigint;
begin
  v_title := btrim(coalesce(p_title, ''));
  v_department := btrim(coalesce(p_department, ''));
  v_email := lower(btrim(coalesce(p_qq_email, '')));
  v_description := btrim(coalesce(p_description, ''));
  if v_title = '' or length(v_title) > 30 then raise exception 'bad title'; end if;
  if v_department = '' then v_department := '综合'; end if;
  if length(v_department) > 20 then raise exception 'bad department'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 254 then raise exception 'bad email'; end if;
  if p_salary_min is not null and p_salary_min < 0 then raise exception 'bad salary'; end if;
  if p_salary_max is not null and p_salary_max < 0 then raise exception 'bad salary'; end if;
  if p_salary_min is not null and p_salary_max is not null and p_salary_min > p_salary_max then raise exception 'bad salary'; end if;
  if length(v_description) > 2000 then raise exception 'bad text'; end if;
  if exists (
    select 1 from public.recruit_positions p where lower(btrim(p.title)) = lower(v_title)
  ) then raise exception 'position exists'; end if;
  if exists (
    select 1 from public.recruit_position_requests r
    where r.status = 'pending' and lower(btrim(r.title)) = lower(v_title)
  ) then raise exception 'already requested'; end if;
  insert into public.recruit_position_requests(title, department, salary_min, salary_max, description, qq_email)
  values (v_title, v_department, p_salary_min, p_salary_max, v_description, v_email)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_recruit_position_request(text, text, integer, integer, text, text) from public;
grant execute on function public.submit_recruit_position_request(text, text, integer, integer, text, text) to anon, authenticated;

-- 仅超管：新增岗位申请列表（按状态筛选；非超管返回空）。
create or replace function public.admin_list_recruit_position_requests(p_status text default null)
returns table(
  id bigint, created_at timestamptz, title text, department text,
  salary_min integer, salary_max integer, description text, qq_email text,
  status text, admin_note text, reviewed_at timestamptz, created_position_id bigint
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.created_at, r.title, r.department,
    r.salary_min, r.salary_max, r.description, r.qq_email,
    r.status, r.admin_note, r.reviewed_at, r.created_position_id
  from public.recruit_position_requests r
  where public.my_role() = 'super_admin'
    and (p_status is null or p_status = '' or p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit 100;
$$;
revoke all on function public.admin_list_recruit_position_requests(text) from public;
grant execute on function public.admin_list_recruit_position_requests(text) to authenticated;

-- 仅超管：审核新增岗位申请。通过时在 recruit_positions 里新建该职位
-- （名额默认 1 人，开放招聘，排序排到最后），并把新职位 id 记回申请；
-- 驳回只改状态与备注，不建职位。已审核过的不能再审。
create or replace function public.admin_review_recruit_position_request(
  p_id bigint, p_status text, p_note text default ''
)
returns table(id bigint, title text, status text, created_position_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_department text;
  v_salary_min integer;
  v_salary_max integer;
  v_description text;
  v_current text;
  v_position_id bigint;
  v_sort integer;
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'bad status'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'bad note'; end if;
  select r.title, r.department, r.salary_min, r.salary_max, r.description, r.status
  into v_title, v_department, v_salary_min, v_salary_max, v_description, v_current
  from public.recruit_position_requests r where r.id = p_id for update;
  if not found then raise exception 'request not found'; end if;
  if v_current <> 'pending' then raise exception 'already reviewed'; end if;
  if p_status = 'approved' then
    -- 通过前再拦一次：同名职位在审核期间被别人建出来了，就不能再建。
    if exists (
      select 1 from public.recruit_positions p where lower(btrim(p.title)) = lower(btrim(v_title))
    ) then raise exception 'position exists'; end if;
    select coalesce(max(p.sort_order), 0) + 10 into v_sort from public.recruit_positions p;
    insert into public.recruit_positions as p(title, department, quota, salary_min, salary_max, description, requirements, is_open, sort_order)
    values (v_title, v_department, 1, v_salary_min, v_salary_max, v_description, '', true, v_sort)
    returning p.id into v_position_id;
  end if;
  update public.recruit_position_requests r
  set status = p_status, admin_note = btrim(coalesce(p_note, '')),
    reviewed_at = now(), reviewed_by = auth.uid(),
    created_position_id = case when p_status = 'approved' then v_position_id else r.created_position_id end
  where r.id = p_id;
  return query select p_id, v_title, p_status, v_position_id;
end $$;
revoke all on function public.admin_review_recruit_position_request(bigint, text, text) from public;
grant execute on function public.admin_review_recruit_position_request(bigint, text, text) to authenticated;

commit;
