-- Restrict regular administrators from modifying administrator profiles.
-- Super administrators retain the existing ability to edit all profiles.
-- Content administrators may continue to edit regular member profiles.

begin;

create or replace function public.admin_update_profile(
  target uuid,
  p_display_name text default null,
  p_real_name text default null,
  p_signature text default null,
  p_bio text default null,
  p_personality text default null,
  p_hobbies text default null,
  p_age integer default null,
  p_video_status text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target uuid := target;
  v_role text;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_role := public.my_role();
  if v_role is null or v_role not in ('admin', 'super_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.role
    into v_target_role
    from public.profiles p
   where p.id = v_target
   for update;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if v_role <> 'super_admin' and v_target_role is distinct from 'member' then
    raise exception 'super administrator required to edit administrator profiles'
      using errcode = '42501';
  end if;

  if p_video_status is not null
     and p_video_status not in ('none', 'pending', 'approved', 'rejected') then
    raise exception 'bad video status' using errcode = '22023';
  end if;

  update public.profiles
     set display_name = coalesce(p_display_name, display_name),
         real_name = coalesce(p_real_name, real_name),
         signature = coalesce(p_signature, signature),
         bio = coalesce(p_bio, bio),
         personality = coalesce(p_personality, personality),
         hobbies = coalesce(p_hobbies, hobbies),
         age = coalesce(p_age, age),
         intro_video_status = coalesce(p_video_status, intro_video_status)
   where id = v_target;

  insert into public.admin_audit_logs (actor, action, target, detail)
  values (
    auth.uid(),
    'admin_update_profile',
    v_target,
    pg_catalog.jsonb_build_object('target', v_target)
  );
end;
$function$;

commit;
