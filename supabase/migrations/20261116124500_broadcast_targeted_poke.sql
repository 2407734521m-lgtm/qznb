-- 广播定向催办：poke_target_ids 限定某次催办只重弹给指定成员。
-- 空数组 = 全部未处理的人，沿用旧行为；非空时成员端只对名单内的人重弹。
-- 配合成员端：重弹时弹窗显示「再次提醒 · 第 N 次」；位置征集里系统未授权（denied）
-- 的人也可被催办重弹（可改手动填写）。
-- 回滚：删 admin_broadcasts 的 poke_target_ids 一列。
alter table public.admin_broadcasts add column if not exists poke_target_ids jsonb not null default '[]'::jsonb;
