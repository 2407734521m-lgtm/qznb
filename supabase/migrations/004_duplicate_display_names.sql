-- 004: allow duplicate display names while keeping internal usernames unique.
-- Apply after 003_auth_profile_fixes.sql in Supabase SQL Editor.
-- This migration is only on the test branch; it has not been run against Supabase.

begin;

-- Preserve the visible names for existing profiles created before this fix.
update public.profiles
set display_name = username::text
where display_name is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name_value text;
  real_name_value text;
  internal_username text;
begin
  display_name_value := nullif(trim(new.raw_user_meta_data->>'username'), '');
  real_name_value := nullif(trim(new.raw_user_meta_data->>'real_name'), '');

  if display_name_value is null then
    raise exception 'username is required';
  end if;

  if char_length(display_name_value) > 30 then
    raise exception 'username must be 30 characters or fewer';
  end if;

  -- The form's name is a display name, not an account identifier.
  -- A UUID-derived internal username prevents collisions between classmates
  -- who choose the same display name.
  internal_username := 'member_' || substring(replace(new.id::text, '-', '') from 1 for 22);

  insert into public.profiles(id, username, display_name, real_name)
  values (new.id, internal_username, display_name_value, real_name_value);

  insert into public.profile_emails(profile_id, email)
  values (new.id, new.email)
  on conflict (profile_id) do update set email = excluded.email;

  insert into public.profile_privacy(profile_id) values (new.id);
  insert into public.profile_contacts(profile_id) values (new.id);
  return new;
end;
$$;

commit;
