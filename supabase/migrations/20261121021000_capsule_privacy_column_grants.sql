-- 20261121021000_capsule_privacy_column_grants.sql
-- 修正 20261121020000 的列级收紧：回读核对发现那则迁移里的
-- REVOKE SELECT (title, content) 是空操作——Postgres 里列级 REVOKE
-- 减不掉表级 GRANT：time_capsules 的表级 ACL 仍是 authenticated/anon
-- 的 ardDxtm，pg_attribute.attacl 全为 null，实测
-- has_column_privilege('authenticated', 'title'/'content', 'SELECT')
-- 仍为 true（三个 RPC 本身已建好且授权正确，不受影响）。
-- 正确做法：先收回表级 SELECT，再按列逐个授回元数据列。
--   REVOKE SELECT ON public.time_capsules FROM authenticated, anon;
--   GRANT SELECT (id, author_id, open_at, is_public, created_at, deleted_at)
--     ON public.time_capsules TO authenticated, anon;
-- 此后直连 API 只能读 6 个元数据列，title/content 彻底读不到；
-- select('*') 会直接报错（预期，前端已改走 RPC）。
-- 不动 INSERT / UPDATE / DELETE 权限（只动 SELECT）；不动 service_role
-- 与 postgres；不动任何策略（tc_sel 等 4 条原样）；不动任何行数据。
-- capsule_reads_insert_own_opened 策略只读 open_at / is_public /
-- author_id / deleted_at / id，均在授回之列，不受影响。
-- MeContent 的 id 计数与 Settings 健康检查的 id 探测也不受影响。
-- 幂等：REVOKE / GRANT 重复执行结果相同。
-- 回滚：GRANT SELECT ON public.time_capsules TO authenticated, anon
-- （并可保留或删除列级授权；同时见 20261121020000 的回滚说明）。

begin;

revoke select on public.time_capsules from authenticated, anon;
grant select (id, author_id, open_at, is_public, created_at, deleted_at)
  on public.time_capsules to authenticated, anon;

commit;
