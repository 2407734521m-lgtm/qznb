-- 038_authorized_request_queue
-- Queue for requests limited to the applicant's own data, explicitly authorized data,
-- or lawful public information. No identity enrichment or reverse lookup is implemented.

create table if not exists public.authorized_request_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_date date not null default (timezone('Asia/Shanghai', now())::date),
  request_type text not null check (request_type in ('本人资料核验','授权资料核验','公开资料整理')),
  description text not null check (char_length(description) between 5 and 500),
  contact text check (contact is null or char_length(contact) <= 100),
  status text not null default 'pending' check (status in ('pending','selected','not_found','completed','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consent_confirmed_at timestamptz not null default now()
);
create index if not exists authorized_request_queue_day_idx on public.authorized_request_queue(request_date, created_at, id);
create index if not exists authorized_request_queue_owner_idx on public.authorized_request_queue(profile_id, created_at desc);
create unique index if not exists authorized_request_queue_one_selected_per_day
  on public.authorized_request_queue(request_date) where status = 'selected';
alter table public.authorized_request_queue enable row level security;
revoke all on public.authorized_request_queue from anon, authenticated;
grant select on public.authorized_request_queue to authenticated;
drop policy if exists authorized_request_queue_read_own on public.authorized_request_queue;
create policy authorized_request_queue_read_own on public.authorized_request_queue for select to authenticated
using (profile_id = (select auth.uid()) or (select public.my_role()) in ('admin','super_admin'));

create or replace function public.submit_authorized_request(p_request_type text, p_description text, p_contact text default null, p_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_lock_day date := timezone('Asia/Shanghai', clock_timestamp())::date;
  v_day date;
  v_status text;
  v_id uuid;
begin
  if v_uid is null then raise exception '请先登录'; end if;
  if p_confirmed is distinct from true then raise exception '请先确认资料归属或授权情况'; end if;
  if p_request_type is null or p_request_type not in ('本人资料核验','授权资料核验','公开资料整理') then raise exception '申请类型无效'; end if;
  if char_length(trim(coalesce(p_description,''))) not between 5 and 500 then raise exception '申请说明长度须为 5 至 500 字'; end if;
  if p_description ~ '([0-9]{11}|[0-9]{15}|[0-9]{17}[0-9Xx])' then raise exception '请勿在申请说明中填写身份证号或完整手机号'; end if;
  if p_contact is not null and char_length(p_contact) > 100 then raise exception '联系方式过长'; end if;

  -- Serialize all submissions and admin resolutions for the same China-local calendar day.
  perform pg_advisory_xact_lock(hashtext('authorized-request-' || v_lock_day::text));
  v_day := timezone('Asia/Shanghai', clock_timestamp())::date;
  if v_day <> v_lock_day then
    perform pg_advisory_xact_lock(hashtext('authorized-request-' || v_day::text));
  end if;

  if exists (select 1 from public.authorized_request_queue where profile_id = v_uid and request_date = v_day) then
    raise exception '你今天已经提交过申请，请查看申请进度';
  end if;

  -- Once a request has completed, the day's queue is closed. Later submissions
  -- are retained as closed (and notified), never left waiting without a resolver.
  if exists (
    select 1 from public.authorized_request_queue
    where request_date = v_day and status = 'completed'
  ) then
    v_status := 'closed';
  elsif exists (
    select 1 from public.authorized_request_queue
    where request_date = v_day and status = 'selected'
  ) then
    v_status := 'pending';
  else
    v_status := 'selected';
  end if;

  insert into public.authorized_request_queue(profile_id, request_date, request_type, description, contact, status, created_at)
  values (v_uid, v_day, p_request_type, trim(p_description), nullif(trim(coalesce(p_contact,'')),''), v_status, clock_timestamp())
  returning id into v_id;

  if v_status = 'closed' then
    insert into public.notifications(profile_id,type,title,body,link)
    values (v_uid,'authorized_request','今日名额已用完','今日优先名额已完成处理，本次申请未进入候选队列。','/board');
  end if;

  return jsonb_build_object(
    'ok',true,
    'id',v_id,
    'status',v_status,
    'message',case
      when v_status = 'selected' then '已获得今日优先处理资格。'
      when v_status = 'pending' then '今日已有申请正在处理，已按提交时间加入候选队列。'
      else '今日名额已完成，本次申请未进入候选队列。'
    end
  );
end $$;

create or replace function public.my_authorized_request_queue()
returns table(id uuid, request_date date, request_type text, status text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select q.id,q.request_date,q.request_type,q.status,q.created_at from public.authorized_request_queue q
  where q.profile_id = auth.uid() order by q.created_at desc limit 20
$$;

create or replace function public.admin_resolve_authorized_request(p_request_id uuid, p_found boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date;
  v_next uuid;
begin
  if coalesce(public.my_role(),'') not in ('admin','super_admin') then
    raise exception 'forbidden';
  end if;

  -- Always acquire the per-day advisory lock before locking queue rows.
  -- This consistent lock order prevents two admins resolving different rows
  -- from deadlocking while one of them attempts to promote the next candidate.
  select request_date into v_day
  from public.authorized_request_queue
  where id = p_request_id;
  if v_day is null then
    raise exception '申请不存在';
  end if;

  perform pg_advisory_xact_lock(hashtext('authorized-request-' || v_day::text));

  -- Re-read and lock only after obtaining the day lock; another resolver may
  -- have changed this row while this transaction was waiting.
  select request_date into v_day
  from public.authorized_request_queue
  where id = p_request_id
  for update;
  if not found then
    raise exception '申请不存在';
  end if;

  update public.authorized_request_queue
  set status = case when p_found then 'completed' else 'not_found' end,
      updated_at = now()
  where id = p_request_id and status = 'selected';
  if not found then
    raise exception '该申请当前不是处理中状态';
  end if;

  if not p_found then
    insert into public.notifications(profile_id,type,title,body,link)
      select profile_id,'authorized_request','申请结果通知','本次申请未能找到符合条件的结果。你可以在「开盒」查看进度。','/board'
      from public.authorized_request_queue where id = p_request_id;

    select id into v_next
    from public.authorized_request_queue
    where request_date = v_day and status = 'pending'
    order by created_at,id
    limit 1
    for update;

    if v_next is not null then
      update public.authorized_request_queue
      set status = 'selected',updated_at = now()
      where id = v_next;

      insert into public.notifications(profile_id,type,title,body,link)
        select profile_id,'authorized_request','轮到你了','前一项申请未能完成，你已递补为今日优先候选。','/board'
        from public.authorized_request_queue where id = v_next;
    end if;
  else
    insert into public.notifications(profile_id,type,title,body,link)
      select profile_id,'authorized_request','申请已完成','你的申请已完成处理。','/board'
      from public.authorized_request_queue where id = p_request_id;

    insert into public.notifications(profile_id,type,title,body,link)
      select profile_id,'authorized_request','今日名额已用完','今日优先名额已完成处理，你的候选申请已结束。','/board'
      from public.authorized_request_queue
      where request_date = v_day and status = 'pending';

    update public.authorized_request_queue
    set status = 'closed', updated_at = now()
    where request_date = v_day and status = 'pending';
  end if;

  return jsonb_build_object('ok',true,'next_request_id',v_next);
end $$;

revoke all on function public.submit_authorized_request(text,text,text,boolean) from public,anon;
revoke all on function public.my_authorized_request_queue() from public,anon;
revoke all on function public.admin_resolve_authorized_request(uuid,boolean) from public,anon;
grant execute on function public.submit_authorized_request(text,text,text,boolean) to authenticated;
grant execute on function public.my_authorized_request_queue() to authenticated;
grant execute on function public.admin_resolve_authorized_request(uuid,boolean) to authenticated;
