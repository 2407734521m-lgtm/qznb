-- Remove TOTP as a mandatory administrator login step.
-- Password authentication plus the server-side profile role remains required.
-- Other admin controls (rate limits, audit logging, session management) are unchanged.

begin;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select p.role
  from public.profiles p
  where p.id = auth.uid();
$function$;

revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated, service_role;

commit;
