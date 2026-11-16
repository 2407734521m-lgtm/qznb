-- Load only the public identity fields needed by anonymous question pages.
-- This mirrors member_directory privacy behavior without opening profiles table reads.
create or replace function public.anonymous_question_profile(p_profile_id uuid)
returns table (
  id uuid,
  username text,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id,
    p.username::text,
    case when privacy.show_name then p.display_name else null end
  from public.profiles p
  join public.profile_privacy privacy on privacy.profile_id = p.id
  where p.id = p_profile_id
    and auth.uid() is not null
    and public.is_member()
    and p.joined = true;
$function$;

revoke all on function public.anonymous_question_profile(uuid) from public, anon;
grant execute on function public.anonymous_question_profile(uuid) to authenticated;
