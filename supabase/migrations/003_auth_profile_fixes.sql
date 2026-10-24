-- 003: align signup metadata, username validation, and invite join RPC.
-- Apply this migration in Supabase SQL Editor before testing the updated frontend.

begin;

alter table public.profiles
  add column if not exists real_name text;

alter table public.profiles
  drop constraint if exists profiles_username_check;

alter table public.profiles
  add constraint profiles_username_check
  check (
    char_length(username::text) between 1 and 30
    and username::text !~ '[[:cntrl:]]'
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_username text;
  new_real_name text;
begin
  new_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  new_real_name := nullif(trim(new.raw_user_meta_data->>'real_name'), '');

  if new_username is null then
    raise exception 'username is required';
  end if;

  if char_length(new_username) > 30 then
    raise exception 'username must be 30 characters or fewer';
  end if;

  insert into public.profiles(id, username, real_name)
  values (new.id, new_username, new_real_name);

  insert into public.profile_privacy(profile_id) values (new.id);
  insert into public.profile_contacts(profile_id) values (new.id);
  return new;
end;
$$;

-- The frontend expects a text nickname from join_with_code.
-- Only authenticated users may call it; it never exposes the invite code.
drop function if exists public.join_with_code(text);
create function public.join_with_code(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  nickname text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if code is null or not exists (
    select 1 from public.app_settings s
    where s.id = 1 and s.invite_code = trim(code)
  ) then
    return null;
  end if;

  update public.profiles p
  set joined = true
  where p.id = auth.uid()
  returning coalesce(nullif(trim(p.display_name), ''), p.username::text)
  into nickname;

  return nickname;
end;
$$;

revoke all on function public.join_with_code(text) from public, anon, authenticated;
grant execute on function public.join_with_code(text) to authenticated;

commit;
