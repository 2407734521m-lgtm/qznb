
-- 一次性初始化：只能在 SQL Editor 里手动执行，且只有尚无超级管理员时才有效。
create or replace function public.bootstrap_super_admin(uname text) returns void language plpgsql
security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where role = 'super_admin') then raise exception 'already initialized'; end if;
  update profiles set role = 'super_admin', joined = true where username = uname;
  if not found then raise exception 'user not found'; end if;
  insert into admin_audit_logs(actor, action, target)
    select id, 'bootstrap_super_admin', id from profiles where username = uname;
end $$;

revoke execute on function public.member_directory, public.member_detail, public.join_class,
  public.set_role, public.username_available, public.bootstrap_super_admin from public, anon, authenticated;
grant execute on function public.member_directory, public.member_detail, public.join_class,
  public.set_role to authenticated;
grant execute on function public.username_available to anon, authenticated;

-- 头像：私有 bucket，2MB，仅图片；成员才能读，只能写自己目录。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists av_sel on storage.objects;
create policy av_sel on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_member());
drop policy if exists av_ins on storage.objects;
create policy av_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists av_upd on storage.objects;
create policy av_upd on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists av_del on storage.objects;
create policy av_del on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
