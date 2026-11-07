-- Automatically mark every newly-created Supabase Auth account as a member.
-- The on_auth_user_created trigger is installed by the initial schema migration;
-- this migration updates its handler so a regular signup no longer needs an invite code.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, username, real_name, phone, joined)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1)),
      nullif(trim(new.raw_user_meta_data->>'real_name'), ''),
      case when coalesce(new.raw_user_meta_data->>'phone', '') ~ '^1[0-9]{10}$'
           then new.raw_user_meta_data->>'phone' else null end,
      true
    );

  insert into public.profile_emails (profile_id, email)
    values (new.id, new.email)
    on conflict (profile_id) do update set email = excluded.email;

  insert into public.profile_privacy (profile_id) values (new.id)
    on conflict (profile_id) do nothing;

  insert into public.profile_contacts (profile_id) values (new.id)
    on conflict (profile_id) do nothing;

  return new;
end;
$function$;
