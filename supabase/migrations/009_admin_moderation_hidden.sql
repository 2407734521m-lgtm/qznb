-- 009_admin_moderation_hidden.sql（未执行，仅供审阅；配合分支 feature/admin-moderation-functions-009）
-- 目的：修复管理员“隐藏/恢复他人动态、评论”被 RLS 拦截的问题，且不放宽整行 UPDATE 策略。
-- 现状（本轮线上只读核对已确认）：posts 仅 p_mod（作者本人可 UPDATE）；comments 无 UPDATE 策略；
--   直接改表的方式下，管理员隐藏他人动态/评论必然被 RLS 拦截，而删除不受影响（删除策略认管理员）。
-- 方案：两个专用 SECURITY DEFINER 函数，只改 deleted_at；原有 RLS 策略一律不动，不碰其他表或数据。
-- 安全要点：
--   1) SET search_path = ''，全部对象 schema 限定（public.my_role、public.posts、public.comments、auth.uid、pg_catalog.now）。
--   2) 不依赖前端传入的角色：函数内先验 auth.uid() 非空，再把 public.my_role() 存入局部变量，验 v_role IS NULL OR v_role NOT IN (...) 否则抛 forbidden。
--      （只写 NOT IN 不够：my_role() 为 NULL 时 NOT IN 的结果是 NULL 而非 TRUE，IF 不触发，会漏过检查；
--       只验 uid 非空也不够：已登录但无资料行的用户同样会让 my_role() 返回 NULL，必须显式验角色空值。）
--   3) 只 UPDATE deleted_at 一列；不存在的 id 抛 not found，不静默成功。
--   4) 授权：撤销 PUBLIC 与 anon，并撤销 service_role（本项目无服务端调用方，前端只用 authenticated 会话调用），仅授予 authenticated。
--      注意：数据库对新建函数有默认授权，上述撤销必须与创建写在同一迁移里，缺一不可；
--      执行后预期授权为 postgres（所有者）与 authenticated 两项，无 anon、无 PUBLIC、无 service_role。
-- 执行前复核（本轮已查，执行时仍须复核）：项目 ldypnxxxgscibopgiaso；p_mod_admin/c_mod_admin 策略与本两函数均不存在；
--   deleted_at 列存在且可空；本文件未执行，严禁触发 migrate.yml（它会跑全部迁移）。

BEGIN;

CREATE FUNCTION public.admin_set_post_hidden(p_id bigint, p_hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_role := public.my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.posts
  SET deleted_at = CASE WHEN p_hidden THEN pg_catalog.now() ELSE NULL END
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
END;
$$;

CREATE FUNCTION public.admin_set_comment_hidden(p_id bigint, p_hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_role := public.my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.comments
  SET deleted_at = CASE WHEN p_hidden THEN pg_catalog.now() ELSE NULL END
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_post_hidden(bigint, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_post_hidden(bigint, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_post_hidden(bigint, boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_post_hidden(bigint, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_comment_hidden(bigint, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_comment_hidden(bigint, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_comment_hidden(bigint, boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_comment_hidden(bigint, boolean) TO authenticated;

COMMIT;

-- 回滚脚本（以下两行仅为注释，不执行；回滚数据库时把它们作为独立 SQL 运行）：
-- DROP FUNCTION IF EXISTS public.admin_set_post_hidden(bigint, boolean);
-- DROP FUNCTION IF EXISTS public.admin_set_comment_hidden(bigint, boolean);
-- 注意区分：上面是“恢复数据库函数”；“恢复代码”是把前端两处 RPC 调用改回直接 .update（改回后原权限错误会重现，回滚不等于修好）。
