-- 013_member_presence_access_hardening.sql
-- Keep the browser's existing self-row upsert working, but do not expose
-- other members' device/IP-derived metadata through direct table queries.
-- The super-admin-only admin_member_accounts() RPC remains the admin read path.

begin;

alter table public.member_presence enable row level security;

revoke all on table public.member_presence from public, anon;
grant select, insert, update on table public.member_presence to authenticated;

drop policy if exists mp_sel on public.member_presence;
drop policy if exists mp_sel_self on public.member_presence;
create policy mp_sel_self
  on public.member_presence
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists mp_ins on public.member_presence;
create policy mp_ins
  on public.member_presence
  for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists mp_upd on public.member_presence;
create policy mp_upd
  on public.member_presence
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

commit;
