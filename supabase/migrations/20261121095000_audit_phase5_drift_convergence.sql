-- 20261121095000_audit_phase5_drift_convergence.sql
-- 第 5 阶段审计发现的仓库与生产库漂移收敛：以下对象在生产库真实存在，
-- 但仓库迁移历史里缺失，只在 src/lib/database.types.ts 里有类型声明。
-- 本迁移全部写成幂等形式（CREATE TABLE IF NOT EXISTS /
-- CREATE OR REPLACE FUNCTION / on conflict do nothing），在生产库上应为
-- 无操作（no-op），只补齐仓库记录，让新环境仅靠迁移能重建出同样的结构。
-- 不改任何现有行数据，不删任何对象，不给两个 public_* RPC 加任何门控
-- （public_admin_app_update / public_musicdl_app_update 保持生产现状：
-- 不验登录、不验角色，见 C 线 S3，需用户定夺后再动）。
-- 函数与表的定义、默认值、约束、RLS 开关、授权均为 2026-11-21 生产库
-- 实测回读的原文（pg_get_functiondef / information_schema / pg_constraint
-- / pg_class / pg_proc.proacl）。
--
-- 注意：审计底稿 C S5 只列了三个函数，实测生产库还有第四个同类函数
-- admin_list_musicdl_app_releases（admin_publish 的配套列表查询，
-- 与 admin_list_admin_app_releases 同款），一并收敛。
-- 回滚：直接删本迁移的记录即可，对象本身保留（生产库原本就有），
-- 无需回滚数据。
--
-- 残留：与之前阶段相同，本迁移只补“缺失的对象”，不修历史迁移的引用
-- 顺序。全新环境按顺序重放仍可能在更早的迁移处失败，要彻底修好需改
-- 动历史迁移，不在本迁移范围；生产库不受影响。

begin;

-- 1) musicdl_app_releases 表：生产库存在，仓库无建表、无 RLS、无策略。
--    列、默认值、主键、唯一约束与 CHECK 约束均与生产库一致。
--    生产库 RLS 已开启、策略数为 0（只能走 RPC，是设计），本迁移不建策略。
create table if not exists public.musicdl_app_releases (
  id bigint generated always as identity primary key,
  version_name text not null check (char_length(btrim(version_name)) between 1 and 40),
  version_code integer not null unique check (version_code > 0),
  apk_url text not null check (apk_url ~ '^https://'),
  update_notes text not null default '' check (char_length(update_notes) <= 4000),
  force_update boolean not null default false,
  min_code integer not null default 0 check (min_code >= 0),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now()
);

alter table public.musicdl_app_releases enable row level security;
revoke all on table public.musicdl_app_releases from public, anon, authenticated;

-- 2) 种子行：与 app_releases / admin_app_releases 的建表迁移同款，
--    从 site_settings 的 musicdl_app_* 键还原当前版本的历史行。
--    生产库已有 version_code = 3（1.2）一行，on conflict do nothing，
--    在生产库上无操作。
with current_settings as (
  select
    max(value) filter (where key = 'musicdl_app_version_name') as version_name,
    max(value) filter (where key = 'musicdl_app_version_code') as version_code,
    max(value) filter (where key = 'musicdl_app_apk_url') as apk_url,
    max(value) filter (where key = 'musicdl_app_update_notes') as update_notes,
    max(value) filter (where key = 'musicdl_app_force_update') as force_update,
    max(value) filter (where key = 'musicdl_app_min_code') as min_code
  from public.site_settings
  where key in ('musicdl_app_version_name','musicdl_app_version_code','musicdl_app_apk_url',
                'musicdl_app_update_notes','musicdl_app_force_update','musicdl_app_min_code')
)
insert into public.musicdl_app_releases (
  version_name, version_code, apk_url, update_notes, force_update, min_code
)
select version_name, version_code::integer, apk_url, coalesce(update_notes, ''),
       coalesce(force_update, 'false') = 'true', coalesce(min_code, '0')::integer
from current_settings
where coalesce(version_name, '') <> ''
  and coalesce(version_code, '') ~ '^[1-9][0-9]*$'
  and coalesce(apk_url, '') ~ '^https://'
  and coalesce(min_code, '0') ~ '^[0-9]+$'
  and coalesce(min_code, '0')::integer <= version_code::integer
on conflict (version_code) do nothing;

-- 3) 管理员发布音乐下载版：写历史 + site_settings + 审计日志，
--    要求新序号大于当前序号。定义为生产库 pg_get_functiondef 原文。
create or replace function public.admin_publish_musicdl_app_release(p_version_name text, p_version_code integer, p_apk_url text, p_notes text DEFAULT ''::text, p_force_update boolean DEFAULT false, p_min_code integer DEFAULT 0)
 returns bigint
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_current_code integer;
  v_release_id bigint;
  v_url text := pg_catalog.btrim(coalesce(p_apk_url, ''));
  v_name text := pg_catalog.btrim(coalesce(p_version_name, ''));
  v_notes text := coalesce(p_notes, '');
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_name) not between 1 and 40
     or p_version_code is null or p_version_code < 1
     or pg_catalog.char_length(v_notes) > 4000
     or v_url !~ '^https://'
     or pg_catalog.char_length(v_url) > 1000
     or p_min_code is null or p_min_code < 0
     or p_min_code > p_version_code then
    raise exception 'invalid release information' using errcode = '22023';
  end if;

  select coalesce(nullif(s.value, '')::integer, 0)
    into v_current_code
    from public.site_settings s
   where s.key = 'musicdl_app_version_code';
  v_current_code := coalesce(v_current_code, 0);

  if p_version_code <= v_current_code then
    raise exception 'new version code must be greater than the current version (%)', v_current_code
      using errcode = '22023';
  end if;

  insert into public.musicdl_app_releases(
    version_name, version_code, apk_url, update_notes, force_update, min_code, published_by
  ) values (
    v_name, p_version_code, v_url, v_notes, coalesce(p_force_update, false), p_min_code, v_actor
  )
  returning id into v_release_id;

  insert into public.site_settings(key, value)
  values
    ('musicdl_app_version_name', v_name),
    ('musicdl_app_version_code', p_version_code::text),
    ('musicdl_app_apk_url', v_url),
    ('musicdl_app_update_notes', v_notes),
    ('musicdl_app_force_update', coalesce(p_force_update, false)::text),
    ('musicdl_app_min_code', p_min_code::text)
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'musicdl_app_release_published',
    pg_catalog.jsonb_build_object(
      'release_id', v_release_id,
      'version_name', v_name,
      'version_code', p_version_code,
      'force_update', coalesce(p_force_update, false),
      'min_code', p_min_code
    )
  );

  return v_release_id;
end;
$function$;

-- 4) 管理员查看音乐下载版发布历史（最近 30 条）。定义为生产库原文。
create or replace function public.admin_list_musicdl_app_releases()
 returns table(id bigint, version_name text, version_code integer, apk_url text, update_notes text, force_update boolean, min_code integer, published_at timestamp with time zone)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  return query
  select r.id, r.version_name, r.version_code, r.apk_url, r.update_notes,
         r.force_update, r.min_code, r.published_at
    from public.musicdl_app_releases r
   order by r.published_at desc
   limit 30;
end;
$function$;

-- 5) 管理版更新元数据（无门控：不验登录/角色，与生产现状一致，见 C S3）。
create or replace function public.public_admin_app_update()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select pg_catalog.jsonb_build_object(
    'app_version_name', coalesce((select value from public.site_settings where key = 'admin_app_version_name' limit 1), ''),
    'app_version_code', coalesce((select value from public.site_settings where key = 'admin_app_version_code' limit 1), '0'),
    'app_update_notes', coalesce((select value from public.site_settings where key = 'admin_app_update_notes' limit 1), ''),
    'app_apk_url', coalesce((select value from public.site_settings where key = 'admin_app_apk_url' limit 1), ''),
    'app_force_update', coalesce((select value from public.site_settings where key = 'admin_app_force_update' limit 1), 'false'),
    'app_min_code', coalesce((select value from public.site_settings where key = 'admin_app_min_code' limit 1), '0')
  );
$function$;

-- 6) 音乐下载版更新元数据（无门控：不验登录/角色，与生产现状一致，见 C S3）。
create or replace function public.public_musicdl_app_update()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select pg_catalog.jsonb_build_object(
    'musicdl_app_version_name', coalesce((select value from public.site_settings where key = 'musicdl_app_version_name' limit 1), ''),
    'musicdl_app_version_code', coalesce((select value from public.site_settings where key = 'musicdl_app_version_code' limit 1), '0'),
    'musicdl_app_update_notes', coalesce((select value from public.site_settings where key = 'musicdl_app_update_notes' limit 1), ''),
    'musicdl_app_apk_url', coalesce((select value from public.site_settings where key = 'musicdl_app_apk_url' limit 1), ''),
    'musicdl_app_force_update', coalesce((select value from public.site_settings where key = 'musicdl_app_force_update' limit 1), 'false'),
    'musicdl_app_min_code', coalesce((select value from public.site_settings where key = 'musicdl_app_min_code' limit 1), '0')
  );
$function$;

-- 7) 授权：以下语句只把生产库已有的授权状态写进仓库；在生产库上均为无操作。
--    public_admin_app_update 保持 PUBLIC 可执行（生产 proacl 含 =X），只补
--    显式授权；其余三个函数按生产 proacl 收敛（管理员函数仅 authenticated，
--    public_musicdl_app_update 仅 anon/authenticated/service_role）。
revoke all on function public.admin_publish_musicdl_app_release(text, integer, text, text, boolean, integer) from public, anon;
revoke all on function public.admin_list_musicdl_app_releases() from public, anon;
revoke all on function public.public_musicdl_app_update() from public;

grant execute on function public.admin_publish_musicdl_app_release(text, integer, text, text, boolean, integer) to authenticated, service_role;
grant execute on function public.admin_list_musicdl_app_releases() to authenticated, service_role;
grant execute on function public.public_musicdl_app_update() to anon, authenticated, service_role;
grant execute on function public.public_admin_app_update() to anon, authenticated, service_role;

commit;
