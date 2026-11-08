-- 维护页恢复通知订阅邮箱（已于 2026-10-31 经 MCP 在 Project B 执行，MCP 侧迁移名 029_maintenance_notify_emails）
-- 访客（含未登录）只能登记写入；读取/更新/删除仅管理员。发送成功后由 maintenance-notify 函数删除对应行。
create table public.maintenance_notify_emails (
  id bigint generated always as identity primary key,
  email text not null,
  created_at timestamptz not null default now(),
  constraint maintenance_notify_emails_email_key unique (email),
  constraint maintenance_notify_emails_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
alter table public.maintenance_notify_emails enable row level security;
create policy mne_ins on public.maintenance_notify_emails for insert to anon, authenticated with check (true);
create policy mne_sel_admin on public.maintenance_notify_emails for select to authenticated using (public.my_role() = any (array['admin','super_admin']));
create policy mne_upd_admin on public.maintenance_notify_emails for update to authenticated using (public.my_role() = any (array['admin','super_admin'])) with check (public.my_role() = any (array['admin','super_admin']));
create policy mne_del_admin on public.maintenance_notify_emails for delete to authenticated using (public.my_role() = any (array['admin','super_admin']));
