-- 广播弹窗新增三种征集类型：投票 vote / 填写 form / 报名 signup。
-- admin_broadcasts.options 存投票选项（jsonb 字符串数组）；broadcast_receipts.answer 存回执答案
-- （投票选项原文 / 填写内容 / 报名时固定为「参加」或「不参加」）。
-- 回滚：删 answer/options 两列，并把两个 check 约束恢复为原来的取值集合。
alter table public.admin_broadcasts drop constraint admin_broadcasts_kind_check;
alter table public.admin_broadcasts add constraint admin_broadcasts_kind_check
  check (kind in ('popup','location','vote','form','signup'));
alter table public.admin_broadcasts add column if not exists options jsonb not null default '[]'::jsonb;

alter table public.broadcast_receipts drop constraint broadcast_receipts_status_check;
alter table public.broadcast_receipts add constraint broadcast_receipts_status_check
  check (status in ('seen','declined','shared','denied','voted','submitted','joined','not_joined'));
alter table public.broadcast_receipts add column if not exists answer text;
