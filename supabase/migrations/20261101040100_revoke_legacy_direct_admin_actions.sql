-- Close the legacy direct account-deletion RPC.
-- Account deletion must go through admin_request_sensitive_action and
-- admin_decide_sensitive_action, which require a second super-admin.
begin;

revoke all on function public.delete_member(uuid)
  from public, anon, authenticated, service_role;

-- These superseded direct paths are no longer used by the application.
revoke all on function public.admin_delete_member_account(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_role(uuid, text)
  from public, anon, authenticated, service_role;

commit;
