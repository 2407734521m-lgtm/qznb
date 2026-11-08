-- 广播扩展：受众新增 selected（指定成员，target_ids 存成员 id 数组）、类型新增 refresh（远程刷新，不弹窗直接刷新页面）；新增 admin_client_stats() 只读统计 RPC（管理员校验，聚合 member_presence.client）。回滚：删 admin_client_stats、删 target_ids 列、两个 check 恢复原集合。
alter table public.admin_broadcasts drop constraint admin_broadcasts_kind_check;
alter table public.admin_broadcasts add constraint admin_broadcasts_kind_check
  check (kind in ('popup','location','vote','form','signup','refresh'));
alter table public.admin_broadcasts drop constraint admin_broadcasts_audience_check;
alter table public.admin_broadcasts add constraint admin_broadcasts_audience_check
  check (audience in ('all','app','web','selected'));
alter table public.admin_broadcasts add column if not exists target_ids jsonb not null default '[]'::jsonb;

create or replace function public.admin_client_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce((select public.my_role()), '') not in ('admin', 'super_admin') then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  with classified as (
    select
      case
        when client like 'app:%' then 'app'
        when client like 'admin:%' then 'admin'
        when client = 'web' then 'web'
        else 'unknown'
      end as kind,
      nullif(coalesce(app_version_name, split_part(coalesce(client, ''), ':', 2)), '') as version
    from public.member_presence
  )
  select pg_catalog.jsonb_build_object(
    'total', (select count(*) from classified),
    'app', (select count(*) from classified where kind = 'app'),
    'web', (select count(*) from classified where kind = 'web'),
    'admin', (select count(*) from classified where kind = 'admin'),
    'unknown', (select count(*) from classified where kind = 'unknown'),
    'versions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', kind, 'version', version, 'count', n) order by kind, version)
      from (
        select kind, version, count(*) as n
        from classified
        where kind in ('app', 'admin') and version is not null
        group by kind, version
      ) v
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$fn$;
revoke all on function public.admin_client_stats() from public;
grant execute on function public.admin_client_stats() to authenticated;
