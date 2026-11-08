
drop policy if exists p_sel on public.profiles;
create policy p_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('admin','super_admin'));
drop policy if exists p_upd on public.profiles;
create policy p_upd on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists pv_sel on public.profile_privacy;
create policy pv_sel on public.profile_privacy for select to authenticated using (profile_id = auth.uid());
drop policy if exists pv_upd on public.profile_privacy;
create policy pv_upd on public.profile_privacy for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists c_sel on public.profile_contacts;
create policy c_sel on public.profile_contacts for select to authenticated using (profile_id = auth.uid());
drop policy if exists c_upd on public.profile_contacts;
create policy c_upd on public.profile_contacts for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists a_sel on public.admin_audit_logs;
create policy a_sel on public.admin_audit_logs for select to authenticated
  using (public.my_role() in ('admin','super_admin'));
