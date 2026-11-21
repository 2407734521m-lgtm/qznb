-- 20261121020000_capsule_privacy.sql
-- 时光胶囊隐私缺口修复（第 3 阶段审计 C S1，用户 2026-11-21 授权修复）：
-- 生产 tc_sel 策略只认 is_public / 本人 / 管理员，无 open_at 门控——任何登录
-- 成员经直连 API（select * from time_capsules）能读到未开启的公开胶囊的
-- 完整标题与内容；前端“未到期绝不露标题与内容”只是遮罩，不是权限。
-- 本次修法（不改 tc_sel 的行可见性，列表不丢行）：
--   1) 列级收紧：REVOKE SELECT (title, content) FROM authenticated, anon。
--      此后直连 API 只能读元数据列；select('*') 会报错（预期），前端凡是
--      还在 select('*') 的地方必须改走 RPC（见 Capsule.tsx 与 Settings.tsx）。
--   2) 新增三个 SECURITY DEFINER RPC（set search_path to 'public'，与仓内
--      其他 RPC 一致），行内复用 tc_sel 的可见性口径
--      （公开 / 本人 / 管理员）再叠加开封门控（open_at <= current_date，
--      本人或管理员除外；current_date 在 Supabase 上是 UTC 日期，与
--      Capsule.tsx 的 today（toISOString().slice(0,10)，UTC 日期）口径一致，
--      也与 capsule_reads_insert_own_opened 策略的 current_date 一致）：
--        list_time_capsules(p_trash)：列表，只返元数据 + 已开封/本人/管理员
--          的标题，不返 content；p_trash=true 时只返本人的回收站行。
--        read_time_capsule(p_id)：读信，仅开封/本人/管理员返 title+content，
--          否则返 0 行（不报错，前端按“还没到开启时间或不存在”提示）。
--        admin_export_time_capsules()：管理员备份导出用，返全部行全部列，
--          仅 admin/super_admin 可调（Settings.tsx 的备份导出改走它，
--          否则 select('*') 会因列权限被拒导致整次导出失败）。
--   3) capsule_reads_insert_own_opened 策略不受影响：它只读 time_capsules
--      的 open_at / is_public / author_id / deleted_at / id，均未收紧。
--   4) MeContent 的胶囊计数只 select id，不受影响；Settings 健康检查只探
--      id 列，不受影响；time_capsules 上无触发器、无视图引用它。
-- “公开信”不是独立功能：全仓搜不到“公开信”，它就是 is_public=true 的
-- 时光胶囊（写信表单“到期后公开给全班看”），本次修复即覆盖它。
-- 幂等：REVOKE 不存在的权限只是警告；函数用 CREATE OR REPLACE；授权语句
-- 用 revoke + grant（重复执行结果相同）。
-- 回滚：重新 GRANT SELECT (title, content) ON public.time_capsules
-- TO authenticated, anon；前端改回 select('*')（或保留 RPC，RPC 本身无害；
-- 但注意保留 RPC 时读信仍走 RPC 门控，行为比回滚前更严）。
-- 不读、不删任何真实胶囊内容；不改任何行数据。

begin;

-- 1) 列级收紧：标题与内容不再能被直连 API 读到。
revoke select (title, content) on public.time_capsules from authenticated, anon;

-- 2a) 列表 RPC：只返元数据 + 已开封/本人/管理员的标题，不返 content。
create or replace function public.list_time_capsules(p_trash boolean default false)
returns table (
  id bigint,
  author_id uuid,
  title text,
  open_at date,
  is_public boolean,
  created_at timestamptz,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    c.id,
    c.author_id,
    case
      when c.open_at <= current_date
        or c.author_id = (select auth.uid())
        or public.my_role() = any (array['admin', 'super_admin'])
      then c.title
      else null
    end,
    c.open_at,
    c.is_public,
    c.created_at,
    c.deleted_at
  from public.time_capsules c
  where
    (
      (not p_trash and c.deleted_at is null)
      or (p_trash and c.deleted_at is not null and c.author_id = (select auth.uid()))
    )
    and (
      c.is_public = true
      or c.author_id = (select auth.uid())
      or public.my_role() = any (array['admin', 'super_admin'])
    )
  order by
    (case when p_trash then c.deleted_at end) desc nulls last,
    c.open_at asc,
    c.id asc
  limit 50;
$$;

revoke all on function public.list_time_capsules(boolean) from public, anon, authenticated;
grant execute on function public.list_time_capsules(boolean) to authenticated;

-- 2b) 读信 RPC：仅开封/本人/管理员返 title + content，否则返 0 行。
create or replace function public.read_time_capsule(p_id bigint)
returns table (
  id bigint,
  author_id uuid,
  title text,
  content text,
  open_at date,
  is_public boolean,
  created_at timestamptz,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.author_id, c.title, c.content, c.open_at, c.is_public, c.created_at, c.deleted_at
  from public.time_capsules c
  where c.id = p_id
    and c.deleted_at is null
    and (
      c.is_public = true
      or c.author_id = (select auth.uid())
      or public.my_role() = any (array['admin', 'super_admin'])
    )
    and (
      c.open_at <= current_date
      or c.author_id = (select auth.uid())
      or public.my_role() = any (array['admin', 'super_admin'])
    );
$$;

revoke all on function public.read_time_capsule(bigint) from public, anon, authenticated;
grant execute on function public.read_time_capsule(bigint) to authenticated;

-- 2c) 管理员备份导出 RPC：返全部行全部列，仅 admin/super_admin 可调。
create or replace function public.admin_export_time_capsules()
returns table (
  id bigint,
  author_id uuid,
  title text,
  content text,
  open_at date,
  is_public boolean,
  created_at timestamptz,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.author_id, c.title, c.content, c.open_at, c.is_public, c.created_at, c.deleted_at
  from public.time_capsules c
  where public.my_role() = any (array['admin', 'super_admin'])
  order by c.id asc;
$$;

revoke all on function public.admin_export_time_capsules() from public, anon, authenticated;
grant execute on function public.admin_export_time_capsules() to authenticated;

comment on function public.list_time_capsules(boolean) is '时光胶囊列表：只返元数据 + 已开封/本人/管理员的标题，不返 content（列权限已收紧，见 20261121020000）。';
comment on function public.read_time_capsule(bigint) is '时光胶囊读信：仅开封/本人/管理员返 title + content，否则返 0 行（见 20261121020000）。';
comment on function public.admin_export_time_capsules() is '时光胶囊管理员备份导出：返全部行全部列，仅 admin/super_admin 可调（见 20261121020000）。';

commit;
