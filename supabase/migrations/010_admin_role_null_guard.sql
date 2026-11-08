-- 010_admin_role_null_guard.sql（未执行，仅供审阅；配合分支 feature/p1-admin-role-null-guard）
-- 目的（P1）：给改角色、禁用/恢复、管理员改资料三个函数补齐空角色拒绝逻辑。
-- 背景：原检查用 <> / NOT IN 判断角色；当 my_role() 返回 NULL（已登录但无资料行）时，
--   比较结果为 NULL 而非 TRUE，IF 不触发，SECURITY DEFINER 的写操作照样执行。
--   当前线上 0 个无资料行登录用户，该漏洞目前不可利用，但代码不能依赖这一数据状态。
-- 改动（仅此三项，其余原样）：
--   set_role / set_joined：把“my_role() <> 'super_admin'”改为 v_role 变量 + “v_role IS NULL OR v_role <> 'super_admin'”。
--   admin_update_profile：把“my_role() NOT IN ('admin','super_admin')”改为 v_role 变量 + “v_role IS NULL OR v_role NOT IN (...)”。
--   原有 uid 非空检查、角色范围、新角色白名单、禁改自己、禁动超管目标、目标不存在报错、审计写入、视频状态白名单全部不动。
-- 刻意不动（需另行决定，不在本批范围）：
--   1) search_path：三函数统一为 ''；set_role/set_joined 的表引用已全部限定为 public.（profiles×2、admin_audit_logs×1/函数），
--      其余调用 public.my_role()/auth.uid() 原已限定，jsonb_build_object 走 pg_catalog 隐式搜索（与已上线 search_path='' 的 admin_update_profile 一致）；
--      只改对象解析方式与搜索路径，不改业务逻辑。admin_update_profile 本轮未动（P1 版原样）。
--   2) 授权：CREATE OR REPLACE 保留现有授权，本文件不增删任何授权；anon 撤销是后续决定项，不混进本批。
--   3) 目标角色限制：admin_update_profile 不新增“禁改超管目标”限制（普通管理员能否改超管资料字段是否符合预期，待用户定）。
--   4) set_joined 参数名：不改函数参数名（线上签名 target uuid, j boolean 保持不变）；前端调用侧改传 j，见 Admin.tsx 改动。
--   5) 不改任何 RLS 策略，不碰其他函数、表或数据。
-- 回滚：不可直接 DROP（会中断管理功能）。执行前必须先备份三函数线上定义；回滚时用备份定义重新 CREATE OR REPLACE。
-- 本文件未执行，严禁触发 migrate.yml（它会跑全部迁移）。

BEGIN;

CREATE OR REPLACE FUNCTION public.set_role(target uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare old text; v_role text;
begin
  v_role := public.my_role();
  if v_role is null or v_role <> 'super_admin' then raise exception 'forbidden'; end if;
  if new_role not in ('admin','member') then raise exception 'invalid role'; end if;
  if target = auth.uid() then raise exception 'cannot change own role'; end if;
  select role into old from public.profiles where id = target;
  if old is null or old = 'super_admin' then raise exception 'invalid target'; end if;
  update public.profiles set role = new_role where id = target;
  insert into public.admin_audit_logs(actor, action, target, detail)
    values (auth.uid(), 'set_role', target, jsonb_build_object('from', old, 'to', new_role));
end
$$;

CREATE OR REPLACE FUNCTION public.set_joined(target uuid, j boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare old boolean; v_role text;
begin
  v_role := public.my_role();
  if v_role is null or v_role <> 'super_admin' then raise exception 'forbidden'; end if;
  if target = auth.uid() then raise exception 'cannot change self'; end if;
  select joined into old from public.profiles where id = target;
  if old is null then raise exception 'user not found'; end if;
  update public.profiles set joined = j where id = target;
  insert into public.admin_audit_logs(actor, action, target, detail)
    values (auth.uid(), 'set_joined', target, jsonb_build_object('from', old, 'to', j));
end
$$;

CREATE OR REPLACE FUNCTION public.admin_update_profile(target uuid, p_display_name text, p_real_name text, p_signature text, p_bio text, p_personality text, p_hobbies text, p_age integer, p_video_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target uuid := target;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_role := public.my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_video_status IS NOT NULL
     AND p_video_status NOT IN ('none', 'pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'bad video status';
  END IF;
  UPDATE public.profiles
  SET
    display_name = COALESCE(p_display_name, display_name),
    real_name = COALESCE(p_real_name, real_name),
    signature = COALESCE(p_signature, signature),
    bio = COALESCE(p_bio, bio),
    personality = COALESCE(p_personality, personality),
    hobbies = COALESCE(p_hobbies, hobbies),
    age = COALESCE(p_age, age),
    intro_video_status = COALESCE(p_video_status, intro_video_status)
  WHERE id = target;
  INSERT INTO public.admin_audit_logs (actor, action, target, detail)
  VALUES (
    auth.uid(),
    'admin_update_profile',
    v_target,
    jsonb_build_object('target', v_target)
  );
END;
$$;

COMMIT;
