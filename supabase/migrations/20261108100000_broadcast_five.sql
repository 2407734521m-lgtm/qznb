-- 广播五项新功能配套结构：定时发布、未读催办、常用模板。
-- admin_broadcasts.starts_at：发布时间（null=立即发布，非空时成员端到点才可见）；
-- poke_at/poke_count：管理员催办时刻与次数，被「暂不参与」(declined) 的成员在 poke_at 晚于其回执时会被重新弹一次；
-- broadcast_templates：常用广播模板，仅管理员可读写，成员无任何权限。
-- 回滚：drop table public.broadcast_templates；删 admin_broadcasts 的 starts_at/poke_at/poke_count 三列。
alter table public.admin_broadcasts add column if not exists starts_at timestamptz;
alter table public.admin_broadcasts add column if not exists poke_at timestamptz;
alter table public.admin_broadcasts add column if not exists poke_count int not null default 0;

create table if not exists public.broadcast_templates (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null,
  title text,
  body text,
  options jsonb not null default '[]'::jsonb,
  audience text not null default 'all',
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.broadcast_templates enable row level security;
revoke all on table public.broadcast_templates from public, anon;
grant select, insert, update, delete on table public.broadcast_templates to authenticated;

drop policy if exists bt_sel on public.broadcast_templates;
create policy bt_sel on public.broadcast_templates for select
  using (my_role() = any (array['admin'::text, 'super_admin'::text]));
drop policy if exists bt_ins on public.broadcast_templates;
create policy bt_ins on public.broadcast_templates for insert
  with check (my_role() = any (array['admin'::text, 'super_admin'::text]));
drop policy if exists bt_upd on public.broadcast_templates;
create policy bt_upd on public.broadcast_templates for update
  using (my_role() = any (array['admin'::text, 'super_admin'::text]))
  with check (my_role() = any (array['admin'::text, 'super_admin'::text]));
drop policy if exists bt_del on public.broadcast_templates;
create policy bt_del on public.broadcast_templates for delete
  using (my_role() = any (array['admin'::text, 'super_admin'::text]));
