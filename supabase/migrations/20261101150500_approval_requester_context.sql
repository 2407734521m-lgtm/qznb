-- Return the requester ID to the super-admin-only approval center so it can
-- disable self-approval controls before an RPC request is sent.
begin;

create or replace function public.admin_sensitive_action_requests()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  update admin_private.sensitive_action_requests
     set status = 'expired'
   where status = 'pending' and expires_at <= pg_catalog.now();

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', r.id,
        'action_type', r.action_type,
        'target_user_id', r.target_user_id,
        'target_name', coalesce(nullif(t.display_name, ''), t.username, '已删除账号'),
        'requester_id', r.requester_id,
        'requester_name', coalesce(nullif(q.display_name, ''), q.username, '管理员'),
        'requested_role', r.requested_role,
        'reason', r.reason,
        'status', r.status,
        'created_at', r.created_at,
        'expires_at', r.expires_at,
        'decided_at', r.decided_at,
        'decided_by_name', coalesce(nullif(d.display_name, ''), d.username, ''),
        'decision_note', r.decision_note
      ) order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select * from admin_private.sensitive_action_requests
    order by created_at desc
    limit 50
  ) r
  left join public.profiles t on t.id = r.target_user_id
  left join public.profiles q on q.id = r.requester_id
  left join public.profiles d on d.id = r.decided_by;

  return v_result;
end;
$function$;

revoke all on function public.admin_sensitive_action_requests() from public, anon;
grant execute on function public.admin_sensitive_action_requests() to authenticated;

commit;
