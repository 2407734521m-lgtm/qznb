-- 002: 管理后台需要的邀请码管理能力
-- 超管可修改邀请码（写审计日志）；管理员可读当前邀请码。

create or replace function public.set_invite_code(new_code text) returns void language plpgsql
security definer set search_path = public as $$
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if new_code is null or char_length(trim(new_code)) < 4 then raise exception 'invalid code'; end if;
  insert into app_settings(id, invite_code) values (1, trim(new_code))
  on conflict (id) do update set invite_code = excluded.invite_code;
  insert into admin_audit_logs(actor, action, detail)
  values (auth.uid(), 'set_invite_code', jsonb_build_object('code', trim(new_code)));
end $$;

revoke all on function public.set_invite_code(text) from public, anon, authenticated;
grant execute on function public.set_invite_code(text) to authenticated;

-- 管理员可读邀请码（普通成员仍不可读）
drop policy if exists app_sel on public.app_settings;
create policy app_sel on public.app_settings for select to authenticated
  using (public.my_role() in ('admin','super_admin'));
