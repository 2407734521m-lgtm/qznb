-- Admin TOTP step-up gate.
-- Admin access requires both aal2 and a TOTP entry in the signed JWT amr claim.
-- Existing RLS policies and SECURITY DEFINER admin RPCs that rely on my_role()
-- see only the least-privilege member role until those checks pass. Returning
-- 'member' rather than NULL also closes legacy SQL <> checks against NULL.
begin;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p.role in ('admin', 'super_admin')
      and (
        coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
        or not (
          coalesce(auth.jwt() -> 'amr', '[]'::jsonb)
            @> '[{"method":"totp"}]'::jsonb
        )
      )
      then 'member'
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid();
$function$;

-- This reveals only whether the caller's own account is an administrator. It
-- is used to decide whether the admin login should enroll/challenge TOTP; it
-- does not authorize any protected data or action.
create or replace function public.admin_login_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select p.role in ('admin', 'super_admin')
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$function$;

revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated, service_role;
revoke all on function public.admin_login_is_admin() from public, anon;
grant execute on function public.admin_login_is_admin() to authenticated;

commit;
