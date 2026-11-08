-- 014_restrict_bootstrap_super_admin_execution.sql
-- Bootstrap is a one-time administrative operation, not a public API.
-- The production project already has a super_admin, so API roles must not
-- be able to invoke this SECURITY DEFINER function.
begin;

revoke execute on function public.bootstrap_super_admin(text) from public;
revoke execute on function public.bootstrap_super_admin(text) from anon;
revoke execute on function public.bootstrap_super_admin(text) from authenticated;
revoke execute on function public.bootstrap_super_admin(text) from service_role;

commit;
