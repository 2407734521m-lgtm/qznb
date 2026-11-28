-- 给栀的工单：超管在管理后台提交改站想法，栀按工单执行。
--
-- 两道门，缺一不可：
--   1. 认暗号：邮件来单只有带了约定的数字暗号才建单，没有暗号的邮件
--      不建单、不执行（建单动作由栀在核对发件人与暗号后手工/巡查建单，
--      本迁移不提供任何公开的邮件来源写入口；暗号本身不写进代码与库里）。
--      后台提交的工单由超管登录态本身背书，code_verified 直接记 true。
--   2. 后台二次确认：工单建好后状态是 awaiting_confirm，只有超管在后台
--      点了「确认执行」变成 confirmed，栀才开始执行；没确认的不执行。
-- 删数据、改权限这类高危动作即使已确认，执行前仍需在聊天里再确认一次。
-- 写操作只走下面的 SECURITY DEFINER 函数，前端不直写；读只限管理员。

begin;

create table if not exists public.zhi_work_orders (
  id bigint generated always as identity primary key,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 2000),
  source text not null default 'admin'
    check (source in ('admin', 'email')),
  code_verified boolean not null default false,
  status text not null default 'awaiting_confirm'
    check (status in ('awaiting_confirm', 'confirmed', 'in_progress', 'done', 'cancelled')),
  admin_reply text check (admin_reply is null or char_length(admin_reply) <= 500),
  created_at timestamptz not null default pg_catalog.now(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz
);

comment on table public.zhi_work_orders is
  '给栀的改站工单：后台提交 + 二次确认后才执行；邮件来单须带约定暗号才建单。';

create index if not exists zhi_work_orders_status_idx
  on public.zhi_work_orders(status, created_at desc);
create index if not exists zhi_work_orders_created_by_idx
  on public.zhi_work_orders(created_by);

alter table public.zhi_work_orders enable row level security;

drop policy if exists zhi_sel on public.zhi_work_orders;
create policy zhi_sel
  on public.zhi_work_orders
  for select
  to authenticated
  using (coalesce(public.my_role(), '') in ('admin', 'super_admin'));

drop policy if exists zhi_del on public.zhi_work_orders;
create policy zhi_del
  on public.zhi_work_orders
  for delete
  to authenticated
  using (coalesce(public.my_role(), '') = 'super_admin');

-- 不设 insert / update 策略：写操作只走下面的函数，绕过函数直接改状态会被 RLS 拦住。

create or replace function public.create_zhi_work_order(
  p_title text,
  p_content text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_title text := nullif(pg_catalog.btrim(p_title), '');
  v_content text := nullif(pg_catalog.btrim(p_content), '');
  v_id bigint;
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) > 100
     or v_content is null or pg_catalog.char_length(v_content) > 2000 then
    raise exception 'invalid work order';
  end if;

  insert into public.zhi_work_orders(created_by, title, content, source, code_verified, status)
  values (v_actor, v_title, v_content, 'admin', true, 'awaiting_confirm')
  returning id into v_id;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'zhi_work_order_created',
    v_actor,
    pg_catalog.jsonb_build_object('order_id', v_id, 'source', 'admin')
  );
  return v_id;
end;
$function$;

create or replace function public.confirm_zhi_work_order(
  p_order_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_order public.zhi_work_orders%rowtype;
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_order_id is null then
    raise exception 'invalid work order';
  end if;

  select * into v_order
    from public.zhi_work_orders
   where id = p_order_id
     for update;
  if not found then
    raise exception 'work order not found';
  end if;
  if v_order.status <> 'awaiting_confirm' then
    raise exception 'work order is not awaiting confirmation';
  end if;

  update public.zhi_work_orders
     set status = 'confirmed',
         confirmed_by = v_actor,
         confirmed_at = pg_catalog.now()
   where id = p_order_id;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'zhi_work_order_confirmed',
    v_order.created_by,
    pg_catalog.jsonb_build_object('order_id', p_order_id)
  );
end;
$function$;

create or replace function public.update_zhi_work_order(
  p_order_id bigint,
  p_status text,
  p_admin_reply text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_order public.zhi_work_orders%rowtype;
  v_reply text := nullif(pg_catalog.btrim(p_admin_reply), '');
  v_allowed boolean := false;
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_order_id is null
     or p_status is null
     or p_status not in ('awaiting_confirm', 'confirmed', 'in_progress', 'done', 'cancelled')
     or (v_reply is not null and pg_catalog.char_length(v_reply) > 500) then
    raise exception 'invalid work order update';
  end if;

  select * into v_order
    from public.zhi_work_orders
   where id = p_order_id
     for update;
  if not found then
    raise exception 'work order not found';
  end if;

  -- 只允许同状态改回复，或下面的流转；待确认的单只能走 confirm 函数确认，
  -- 不能直接跳成已确认/处理中/已完成，这就是二次确认这道门。
  v_allowed := (p_status = v_order.status)
    or (v_order.status = 'awaiting_confirm' and p_status = 'cancelled')
    or (v_order.status = 'confirmed' and p_status in ('in_progress', 'done', 'cancelled'))
    or (v_order.status = 'in_progress' and p_status in ('done', 'cancelled'))
    or (v_order.status = 'done' and p_status = 'confirmed')
    or (v_order.status = 'cancelled' and p_status = 'awaiting_confirm');
  if not v_allowed then
    raise exception 'invalid work order transition';
  end if;

  update public.zhi_work_orders
     set status = p_status,
         admin_reply = v_reply,
         confirmed_by = case when p_status = 'awaiting_confirm' then null else confirmed_by end,
         confirmed_at = case when p_status = 'awaiting_confirm' then null else confirmed_at end,
         handled_at = case when p_status = 'done' then pg_catalog.now() else null end
   where id = p_order_id;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'zhi_work_order_updated',
    v_order.created_by,
    pg_catalog.jsonb_build_object(
      'order_id', p_order_id,
      'from_status', v_order.status,
      'status', p_status,
      'has_reply', v_reply is not null
    )
  );
end;
$function$;

revoke all on function public.create_zhi_work_order(text, text) from public, anon;
grant execute on function public.create_zhi_work_order(text, text) to authenticated;
revoke all on function public.confirm_zhi_work_order(bigint) from public, anon;
grant execute on function public.confirm_zhi_work_order(bigint) to authenticated;
revoke all on function public.update_zhi_work_order(bigint, text, text) from public, anon;
grant execute on function public.update_zhi_work_order(bigint, text, text) to authenticated;

commit;
