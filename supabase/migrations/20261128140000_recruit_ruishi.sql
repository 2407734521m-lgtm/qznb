-- 20261128140000_recruit_ruishi.sql
-- 瑞氏集团有限公司招聘：职位与应聘申请。
-- 流程借 No85 网上求职招聘管理系统（三角色：管理员发职位、用户投简历、
-- 招聘人员看简历点通过/不通过、发通知），在本站 React+Supabase 技术栈里
-- 重新实现，不跑原项目的 Java/JSP/MySQL。
-- 写路径一律走 SECURITY DEFINER 的 RPC；表本身不对客户端开放写权限。
-- 名额校验在后端做：提交时已通过人数 >= 名额直接拒绝；审核通过时对职位
-- 行加锁再数一遍，防止两人同时通过超员。
-- 回滚：drop table public.recruit_applications; drop table public.recruit_positions;
-- （函数随表删除；email_delivery_logs 的两条 check 约束需另行恢复）。

begin;

create table if not exists public.recruit_positions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  department text not null default '综合',
  quota integer not null default 1 check (quota >= 0),
  salary_min integer check (salary_min is null or salary_min >= 0),
  salary_max integer check (salary_max is null or salary_max >= 0),
  description text not null default '',
  requirements text not null default '',
  is_open boolean not null default true,
  sort_order integer not null default 0,
  check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create table if not exists public.recruit_applications (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  position_id bigint not null references public.recruit_positions(id) on delete restrict,
  name text not null,
  qq_email text not null,
  phone text not null default '',
  intro text not null default '',
  experience text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by uuid,
  email_sent_at timestamptz,
  email_status text not null default ''
);

create index if not exists recruit_applications_position_status_idx
  on public.recruit_applications(position_id, status);
create index if not exists recruit_applications_qq_email_created_idx
  on public.recruit_applications(qq_email, created_at desc);

alter table public.recruit_positions enable row level security;
alter table public.recruit_applications enable row level security;

revoke all on table public.recruit_positions from public, anon, authenticated;
revoke all on table public.recruit_applications from public, anon, authenticated;
grant select on table public.recruit_positions to anon, authenticated;

-- 公开只读开放中的职位；关闭的职位与全部申请一律不直接暴露。
drop policy if exists recruit_positions_public_read on public.recruit_positions;
create policy recruit_positions_public_read on public.recruit_positions
  for select to anon, authenticated using (is_open = true);

-- 初始职位表（11 个）：名额按用户定的数写死在种子数据里，后台可再改。
insert into public.recruit_positions
  (title, department, quota, salary_min, salary_max, description, requirements, sort_order)
select * from (values
  ('董事长', '管理层', 1, 30000, 50000,
   '全面主持集团经营管理工作，制定集团发展战略，对集团整体经营结果负责。',
   '十年以上企业高层管理经验，具备战略眼光、决策能力与行业资源。', 10),
  ('总经理', '管理层', 1, 20000, 35000,
   '协助董事长落实经营目标，统筹各部门日常运营与跨部门协作。',
   '五年以上企业中高层管理经验，熟悉多部门协同与目标管理。', 20),
  ('人事经理', '人事行政', 1, 8000, 12000,
   '负责招聘、入职、考勤、绩效与员工关系等人事全流程工作。',
   '三年以上人事工作经验，熟悉招聘渠道与劳动法规，沟通细致耐心。', 30),
  ('财务总监', '财务', 1, 15000, 25000,
   '统筹集团财务管理、预算、税务与资金计划，对财务数据真实性负责。',
   '五年以上财务管理经验，持有中级会计师及以上职称者优先。', 40),
  ('会计', '财务', 2, 5000, 8000,
   '负责日常账务处理、凭证、报表编制与纳税申报。',
   '会计相关专业，持有初级会计职称，熟练使用财务软件。', 50),
  ('技术总监', '技术', 1, 18000, 30000,
   '负责集团技术方向、系统架构与研发团队管理。',
   '八年以上开发经验，三年以上技术管理经验，有大型项目落地经验。', 60),
  ('前端工程师', '技术', 1, 8000, 15000,
   '负责公司网站与内部系统的前端开发、页面实现与体验优化。',
   '熟练掌握 React / TypeScript，了解移动端适配，有完整项目经验。', 70),
  ('后端工程师', '技术', 1, 9000, 16000,
   '负责服务端接口、数据库与内部工具的开发与维护。',
   '熟练掌握 Node.js 或 Java，了解 PostgreSQL，有接口开发经验。', 80),
  ('运营专员', '运营', 2, 5000, 8000,
   '负责内容运营、活动策划与日常数据跟进。',
   '擅长文字与沟通，做事细致，有新媒体或活动经验者优先。', 90),
  ('保洁员', '后勤', 2, 3000, 4500,
   '负责办公区域日常清洁与环境维护。',
   '身体健康，吃苦耐劳，有保洁工作经验者优先。', 100),
  ('保安', '后勤', 2, 3500, 5000,
   '负责公司出入口管理、日常巡查与安全保障。',
   '身体健康，责任心强，退伍军人优先。', 110)
) as v(title, department, quota, salary_min, salary_max, description, requirements, sort_order)
where not exists (select 1 from public.recruit_positions);

-- 各开放职位已通过（已招）人数，供公开列表显示“招几人 / 已招几人”。
create or replace function public.recruit_position_counts()
returns table(position_id bigint, approved_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, count(a.id) filter (where a.status = 'approved')
  from public.recruit_positions p
  left join public.recruit_applications a on a.position_id = p.id
  where p.is_open
  group by p.id;
$$;
revoke all on function public.recruit_position_counts() from public;
grant execute on function public.recruit_position_counts() to anon, authenticated;

-- 游客提交申请：校验输入、职位开放、名额未满、同一邮箱同一职位不重复投递。
create or replace function public.submit_recruit_application(
  p_position_id bigint, p_name text, p_qq_email text,
  p_phone text default '', p_intro text default '', p_experience text default ''
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_quota integer;
  v_is_open boolean;
  v_approved bigint;
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
  select quota, is_open into v_quota, v_is_open
  from public.recruit_positions where id = p_position_id;
  if not found or not v_is_open then raise exception 'position closed'; end if;
  select count(*) into v_approved
  from public.recruit_applications
  where position_id = p_position_id and status = 'approved';
  if v_approved >= v_quota then raise exception 'position full'; end if;
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

-- 凭 QQ 邮箱查自己的申请进度：只返回状态类字段，不含电话与自我介绍。
create or replace function public.recruit_my_applications(p_qq_email text)
returns table(id bigint, position_id bigint, position_title text, status text, created_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.position_id, p.title, a.status, a.created_at, a.reviewed_at
  from public.recruit_applications a
  join public.recruit_positions p on p.id = a.position_id
  where a.qq_email = lower(btrim(coalesce(p_qq_email, '')))
  order by a.created_at desc
  limit 50;
$$;
revoke all on function public.recruit_my_applications(text) from public;
grant execute on function public.recruit_my_applications(text) to anon, authenticated;

-- 以下仅超管：职位管理、申请列表、审核、统计。

create or replace function public.admin_list_recruit_positions()
returns table(
  id bigint, created_at timestamptz, title text, department text, quota integer,
  salary_min integer, salary_max integer, description text, requirements text,
  is_open boolean, sort_order integer,
  approved_count bigint, pending_count bigint, total_count bigint
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.created_at, p.title, p.department, p.quota, p.salary_min, p.salary_max,
    p.description, p.requirements, p.is_open, p.sort_order,
    count(a.id) filter (where a.status = 'approved'),
    count(a.id) filter (where a.status = 'pending'),
    count(a.id)
  from public.recruit_positions p
  left join public.recruit_applications a on a.position_id = p.id
  where public.my_role() = 'super_admin'
  group by p.id
  order by p.sort_order, p.id;
$$;
revoke all on function public.admin_list_recruit_positions() from public;
grant execute on function public.admin_list_recruit_positions() to authenticated;

create or replace function public.admin_upsert_recruit_position(
  p_id bigint, p_title text, p_department text, p_quota integer,
  p_salary_min integer, p_salary_max integer,
  p_description text, p_requirements text, p_is_open boolean, p_sort_order integer
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
  if p_id is null then
    insert into public.recruit_positions(title, department, quota, salary_min, salary_max, description, requirements, is_open, sort_order)
    values (p_title, p_department, p_quota, p_salary_min, p_salary_max,
      coalesce(p_description, ''), coalesce(p_requirements, ''), coalesce(p_is_open, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.recruit_positions set
      title = p_title, department = p_department, quota = p_quota,
      salary_min = p_salary_min, salary_max = p_salary_max,
      description = coalesce(p_description, ''), requirements = coalesce(p_requirements, ''),
      is_open = coalesce(p_is_open, true), sort_order = coalesce(p_sort_order, 0),
      updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'position not found'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.admin_upsert_recruit_position(bigint, text, text, integer, integer, integer, text, text, boolean, integer) from public;
grant execute on function public.admin_upsert_recruit_position(bigint, text, text, integer, integer, integer, text, text, boolean, integer) to authenticated;

create or replace function public.admin_list_recruit_applications(
  p_position_id bigint default null, p_status text default null, p_limit integer default 100
)
returns table(
  id bigint, created_at timestamptz, position_id bigint, position_title text,
  name text, qq_email text, phone text, intro text, experience text,
  status text, admin_note text, reviewed_at timestamptz,
  email_sent_at timestamptz, email_status text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.created_at, a.position_id, p.title,
    a.name, a.qq_email, a.phone, a.intro, a.experience,
    a.status, a.admin_note, a.reviewed_at, a.email_sent_at, a.email_status
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

-- 审核：通过时先对职位行加锁再数已通过人数，满员直接拒绝，防并发超员。
create or replace function public.admin_review_recruit_application(
  p_id bigint, p_status text, p_note text default ''
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
    reviewed_at = now(), reviewed_by = auth.uid()
  where a.id = p_id;
  return query select p_id, v_position_id,
    (select r.title from public.recruit_positions r where r.id = v_position_id),
    v_name, v_email, p_status;
end $$;
revoke all on function public.admin_review_recruit_application(bigint, text, text) from public;
grant execute on function public.admin_review_recruit_application(bigint, text, text) to authenticated;

create or replace function public.admin_recruit_stats()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'total_positions', (select count(*) from public.recruit_positions),
    'open_positions', (select count(*) from public.recruit_positions where is_open),
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

-- 录用/婉拒邮件走 email-dispatch：把新类别与来源放进白名单。
-- email_delivery_logs 的两条 check 是建表时的匿名约束，Postgres 自动命名为
-- email_delivery_logs_category_check / email_delivery_logs_source_check。
alter table public.email_delivery_logs drop constraint if exists email_delivery_logs_category_check;
alter table public.email_delivery_logs add constraint email_delivery_logs_category_check
  check (category in (
    'admin_broadcast', 'maintenance_recovery', 'support_feedback',
    'security_notice', 'friend_notification', 'product_update',
    'system_notice', 'recruit_notice'
  )) not valid;
alter table public.email_delivery_logs validate constraint email_delivery_logs_category_check;
alter table public.email_delivery_logs drop constraint if exists email_delivery_logs_source_check;
alter table public.email_delivery_logs add constraint email_delivery_logs_source_check
  check (source in (
    'admin-bulk-email', 'maintenance-notify', 'dev-feedback', 'friend-request-email',
    'recruit-notify'
  )) not valid;
alter table public.email_delivery_logs validate constraint email_delivery_logs_source_check;

commit;
