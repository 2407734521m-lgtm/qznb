
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
