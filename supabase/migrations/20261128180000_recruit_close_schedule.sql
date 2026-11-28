-- 20261128180000_recruit_close_schedule.sql
-- 招聘关闭时间：管理员设定一个关闭时间，到时间后整个招聘板块关闭，
-- 不再接受新申请；已提交的申请照常审核，进度查询不受影响。
-- 关闭时间存在 site_settings 的一行（key = 'recruit_close_at'，值是 ISO 时间字符串），
-- 不为此新建表。公开读只走 public_recruit_close_at()，不直接开放 site_settings。
-- 回滚：drop 两个函数、删 site_settings 里 recruit_close_at 这一行。

begin;

-- 公开读关闭时间：没设返回 null；值非法也返回 null（不报错，前台按未设置处理）。
create or replace function public.public_recruit_close_at()
returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  v_value text;
  v_close_at timestamptz;
begin
  select s.value into v_value from public.site_settings s where s.key = 'recruit_close_at';
  if v_value is null or btrim(v_value) = '' then return null; end if;
  begin
    v_close_at := v_value::timestamptz;
  exception when others then
    return null;
  end;
  return v_close_at;
end $$;
revoke all on function public.public_recruit_close_at() from public;
grant execute on function public.public_recruit_close_at() to anon, authenticated;

-- 管理员设定 / 清除关闭时间：传 timestamptz 写值，传 null 删行重新开放。
-- 返回设定后的关闭时间（清除时返回 null）。
create or replace function public.admin_set_recruit_close_at(p_close_at timestamptz)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if p_close_at is null then
    delete from public.site_settings where key = 'recruit_close_at';
    return null;
  end if;
  insert into public.site_settings(key, value, updated_at)
  values (
    'recruit_close_at',
    to_char(p_close_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    now()
  )
  on conflict (key) do update
    set value = excluded.value, updated_at = now();
  return p_close_at;
end $$;
revoke all on function public.admin_set_recruit_close_at(timestamptz) from public;
grant execute on function public.admin_set_recruit_close_at(timestamptz) to authenticated;

commit;
