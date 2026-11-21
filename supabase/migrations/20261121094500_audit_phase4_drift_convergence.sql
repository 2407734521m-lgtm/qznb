-- 20261121094500_audit_phase4_drift_convergence.sql
-- 第 4 阶段审计发现的仓库与生产库漂移收敛：以下对象在生产库真实存在，
-- 但仓库迁移历史里缺失（或只有授权、无定义）。本迁移全部写成幂等形式
-- （CREATE TABLE IF NOT EXISTS / DO 块判重 / CREATE OR REPLACE FUNCTION），
-- 在生产库上应为无操作（no-op），只补齐仓库记录，让新环境仅靠迁移能
-- 重建出同样的结构。不改任何现有行数据，不删任何对象，不改任何策略
-- 表达式（site_settings 的 ss_sel 保持生产现状：using (true)，见 A 线
-- S3，需用户定夺后再动）。回滚：直接删本迁移的记录即可，对象本身保留
-- （生产库原本就有），无需回滚数据。
--
-- 残留：本迁移只补“缺失的对象”，不修历史迁移的引用顺序。更早的迁移
-- （如 015 对 set_joined 等函数的授权、018 的祝福触发器）在仓库时间线
-- 上先于本迁移就引用这些对象，全新环境按顺序重放仍会在那些迁移处失败
-- ——要彻底修好需改动历史迁移，不在本迁移范围；生产库不受影响。

-- 1) site_settings 表：生产库存在，仓库 124 个迁移里无建表、无 RLS。
--    列、默认值、主键均与生产库一致（2026-11-21 实测回读）。
create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''::text,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;

-- 2) backup_logs 表：生产库存在，仓库无建表、无 RLS。
create table if not exists public.backup_logs (
  id bigint generated always as identity primary key,
  created_by uuid references public.profiles(id) on delete set null,
  scope text not null,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.backup_logs enable row level security;

-- 3) RLS 策略：以下表达式均为生产库实测回读的原文，角色均为 authenticated。
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_settings' and policyname = 'ss_ins') then
    create policy ss_ins on public.site_settings for insert to authenticated
      with check ((my_role() = 'super_admin'::text));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_settings' and policyname = 'ss_sel') then
    create policy ss_sel on public.site_settings for select to authenticated
      using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_settings' and policyname = 'ss_upd') then
    create policy ss_upd on public.site_settings for update to authenticated
      using ((my_role() = 'super_admin'::text))
      with check ((my_role() = 'super_admin'::text));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'backup_logs' and policyname = 'bl_ins') then
    create policy bl_ins on public.backup_logs for insert to authenticated
      with check (((my_role() = 'super_admin'::text) and (auth.uid() = created_by)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'backup_logs' and policyname = 'bl_sel') then
    create policy bl_sel on public.backup_logs for select to authenticated
      using ((my_role() = 'super_admin'::text));
  end if;
end $$;

-- 4) 四个 RPC：生产库存在，仓内没有任何 CREATE 定义，只有 015 的
--    REVOKE/GRANT 授权行。以下定义取自生产库 pg_get_functiondef
--    （2026-11-21 实测），逐字收录。
CREATE OR REPLACE FUNCTION public.create_invite_code(new_code text, nick text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  if new_code is null or pg_catalog.btrim(new_code) = '' then
    raise exception 'code required';
  end if;
  insert into public.invite_codes (code, nickname, active, created_by)
  values (pg_catalog.btrim(new_code), nullif(pg_catalog.btrim(coalesce(nick, '')), ''), true, auth.uid());
  insert into public.admin_audit_logs(actor, action, detail)
  values (auth.uid(), 'create_invite_code',
          pg_catalog.jsonb_build_object('code', pg_catalog.btrim(new_code), 'nickname', nick));
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_invite_code(cid bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  delete from public.invite_codes where id = cid;
  if not found then raise exception 'not found'; end if;
  insert into public.admin_audit_logs(actor, action, detail)
  values (auth.uid(), 'delete_invite_code', pg_catalog.jsonb_build_object('id', cid));
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_game_profile(pid uuid, approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'forbidden';
  end if;
  update public.game_profiles
  set status = case when approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(), updated_at = now()
  where profile_id = pid and status = 'pending';
  if not found then raise exception 'not found or not pending'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_invite_code_active(cid bigint, active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  update public.invite_codes set active = set_invite_code_active.active where id = cid;
  if not found then raise exception 'not found'; end if;
end;
$function$;
