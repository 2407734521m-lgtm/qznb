-- 012_admin_delete_member_account.sql
-- Permanently delete a regular member account. Super-admin only.
-- Deleting auth.users cascades to that member's profile and authored content
-- where existing foreign keys use ON DELETE CASCADE. The UI must disclose this.

begin;

create or replace function public.admin_delete_member_account(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_actor_role text;
  v_target_role text;
  v_target_username text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  v_actor_role := public.my_role();
  if v_actor_role is null or v_actor_role <> 'super_admin' then
    raise exception 'forbidden: super_admin only';
  end if;

  if target is null then
    raise exception 'invalid target';
  end if;
  if target = v_actor then
    raise exception 'cannot delete own account';
  end if;

  select p.role, p.username::text
    into v_target_role, v_target_username
  from public.profiles p
  where p.id = target;

  if not found then
    raise exception 'account not found';
  end if;

  if v_target_role is distinct from 'member' then
    raise exception 'only regular member accounts can be deleted';
  end if;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'delete_member_account',
    target,
    pg_catalog.jsonb_build_object(
      'username', v_target_username,
      'note', 'Deleted by super_admin; authored records may be removed by existing cascade constraints.'
    )
  );

  delete from auth.users where id = target;
  if not found then
    raise exception 'auth account not found';
  end if;
end;
$$;

revoke all on function public.admin_delete_member_account(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_member_account(uuid) to authenticated;

commit;
