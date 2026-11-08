-- 可重复执行。在 Supabase 控制台 SQL Editor 中整段运行。
create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  role text not null default 'member' check (role in ('super_admin','admin','member')),
  joined boolean not null default false,
  display_name text check (char_length(display_name) <= 30),
  age int check (age between 5 and 120),
  personality text check (char_length(personality) <= 60),
  signature text check (char_length(signature) <= 80),
  bio text check (char_length(bio) <= 1000),
  hobbies text check (char_length(hobbies) <= 200),
  avatar_path text,
  theme jsonb not null default '{"theme":"aurora","layout":"left"}',
  created_at timestamptz not null default now()
);
create table if not exists public.profile_privacy (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  show_name bool not null default true, show_age bool not null default true,
  show_personality bool not null default true, show_signature bool not null default true,
  show_bio bool not null default true, show_hobbies bool not null default true,
  show_avatar bool not null default true,
  show_contact bool not null default false, show_social bool not null default false
);
create table if not exists public.profile_contacts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  contact text check (char_length(contact) <= 100),
  social text check (char_length(social) <= 100)
);
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1), invite_code text
);
create table if not exists public.admin_audit_logs (
  id bigserial primary key, actor uuid, action text not null, target uuid,
  detail jsonb, created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profile_privacy enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.app_settings enable row level security;   -- 无任何策略 = 前端完全不可读
alter table public.admin_audit_logs enable row level security;

create or replace function public.my_role() returns text language sql stable security definer
set search_path = public as $$ select role from profiles where id = auth.uid() $$;
create or replace function public.is_member() returns boolean language sql stable security definer
set search_path = public as $$ select coalesce((select joined from profiles where id = auth.uid()), false) $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into profiles(id, username) values (new.id, new.raw_user_meta_data->>'username');
  insert into profile_privacy(profile_id) values (new.id);
  insert into profile_contacts(profile_id) values (new.id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 表权限：role / joined / username 不在可更新列中，普通用户无法自行提权。
revoke all on public.profiles, public.profile_privacy, public.profile_contacts,
  public.app_settings, public.admin_audit_logs from anon, authenticated;
grant select on public.profiles, public.profile_privacy, public.profile_contacts, public.admin_audit_logs to authenticated;
grant update (display_name, age, personality, signature, bio, hobbies, avatar_path, theme) on public.profiles to authenticated;
grant update on public.profile_privacy, public.profile_contacts to authenticated;

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

-- 他人资料只能通过下面的函数读取，服务端按隐私开关裁剪字段。
create or replace function public.member_directory(q text default '', lim int default 12, skip int default 0)
returns table(id uuid, username text, display_name text, personality text, signature text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text,
    case when pr.show_name then p.display_name end,
    case when pr.show_personality then p.personality end,
    case when pr.show_signature then p.signature end,
    case when pr.show_avatar then p.avatar_path end
  from profiles p join profile_privacy pr on pr.profile_id = p.id
  where public.is_member() and p.joined
    and (q = '' or p.username ilike '%' || q || '%'
      or (pr.show_name and p.display_name ilike '%' || q || '%')
      or (pr.show_personality and p.personality ilike '%' || q || '%'))
  order by p.created_at limit least(lim, 50) offset greatest(skip, 0)
$$;

create or replace function public.member_detail(uid uuid)
returns table(id uuid, username text, display_name text, age int, personality text, signature text,
  bio text, hobbies text, avatar_path text, theme jsonb, contact text, social text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text,
    case when pr.show_name then p.display_name end, case when pr.show_age then p.age end,
    case when pr.show_personality then p.personality end, case when pr.show_signature then p.signature end,
    case when pr.show_bio then p.bio end, case when pr.show_hobbies then p.hobbies end,
    case when pr.show_avatar then p.avatar_path end, p.theme,
    case when pr.show_contact then c.contact end, case when pr.show_social then c.social end
  from profiles p join profile_privacy pr on pr.profile_id = p.id join profile_contacts c on c.profile_id = p.id
  where p.id = uid and public.is_member() and p.joined
$$;

create or replace function public.username_available(u text) returns boolean language sql stable
security definer set search_path = public as $$ select not exists (select 1 from profiles where username = u) $$;

create or replace function public.join_class(code text) returns boolean language plpgsql
security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from app_settings where invite_code is not null and invite_code = code) then
    update profiles set joined = true where id = auth.uid();
    return true;
  end if;
  return false;
end $$;

create or replace function public.set_role(target uuid, new_role text) returns void language plpgsql
security definer set search_path = public as $$
declare old text;
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if new_role not in ('admin','member') then raise exception 'invalid role'; end if;
  if target = auth.uid() then raise exception 'cannot change own role'; end if;
  select role into old from profiles where id = target;
  if old is null or old = 'super_admin' then raise exception 'invalid target'; end if;
  update profiles set role = new_role where id = target;
  insert into admin_audit_logs(actor, action, target, detail)
    values (auth.uid(), 'set_role', target, jsonb_build_object('from', old, 'to', new_role));
end $$;

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
