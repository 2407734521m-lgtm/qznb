-- Two-person approval for high-risk super-admin actions.
-- The requester cannot approve their own request. Execution happens only
-- inside the SECURITY DEFINER decision RPC after a distinct super-admin approves.

begin;

create schema if not exists admin_private;
revoke all on schema admin_private from public, anon, authenticated;

create table if not exists admin_private.sensitive_action_requests (
  id uuid primary key default gen_random_uuid(),
  action_type text not null check (action_type in ('delete_member_account', 'set_role')),
  target_user_id uuid not null,
  requested_role text check (requested_role is null or requested_role in ('member', 'admin')),
  requester_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 8 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '72 hours'),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text
);

create index if not exists sensitive_action_requests_recent_idx
  on admin_private.sensitive_action_requests (created_at desc);
create unique index if not exists sensitive_action_requests_one_pending_idx
  on admin_private.sensitive_action_requests (action_type, target_user_id)
  where status = 'pending';

revoke all on table admin_private.sensitive_action_requests from public, anon, authenticated;

create or replace function public.admin_request_sensitive_action(
  p_action_type text,
  p_target_user_id uuid,
  p_requested_role text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_target_role text;
  v_request_id uuid;
begin
  if v_actor is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_action_type is null
     or p_action_type not in ('delete_member_account', 'set_role')
     or p_target_user_id is null
     or p_target_user_id = v_actor
     or p_reason is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 8
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 300 then
    raise exception 'invalid approval request';
  end if;

  update admin_private.sensitive_action_requests
     set status = 'expired'
   where status = 'pending' and expires_at <= pg_catalog.now();

  select p.role into v_target_role
    from public.profiles p
   where p.id = p_target_user_id
   for update;

  if not found then
    raise exception 'target account not found';
  end if;

  if p_action_type = 'delete_member_account' then
    if v_target_role <> 'member' or p_requested_role is not null then
      raise exception 'only regular member accounts can be deleted';
    end if;
  elsif p_requested_role is null
        or p_requested_role not in ('member', 'admin')
        or v_target_role = 'super_admin'
        or p_requested_role = v_target_role then
    raise exception 'invalid role change target';
  end if;

  insert into admin_private.sensitive_action_requests (
    action_type, target_user_id, requested_role, requester_id, reason
  ) values (
    p_action_type, p_target_user_id, p_requested_role, v_actor, pg_catalog.btrim(p_reason)
  ) returning id into v_request_id;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor, 'sensitive_action_requested', p_target_user_id,
    pg_catalog.jsonb_build_object('request_id', v_request_id, 'action_type', p_action_type)
  );

  return v_request_id;
end;
$function$;

create or replace function public.admin_decide_sensitive_action(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_request admin_private.sensitive_action_requests%rowtype;
  v_target_role text;
  v_target_username text;
begin
  if v_actor is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  select * into v_request
    from admin_private.sensitive_action_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'approval request not found';
  end if;
  if p_approve is null then
    raise exception 'approval decision is required';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'approval request is no longer pending';
  end if;
  if v_request.requester_id = v_actor then
    raise exception 'requester cannot approve their own request';
  end if;
  if v_request.expires_at <= pg_catalog.now() then
    update admin_private.sensitive_action_requests
       set status = 'expired'
     where id = p_request_id;
    raise exception 'approval request expired';
  end if;
  if p_note is not null and pg_catalog.char_length(pg_catalog.btrim(p_note)) > 300 then
    raise exception 'decision note too long';
  end if;

  select p.role, p.username::text
    into v_target_role, v_target_username
    from public.profiles p
   where p.id = v_request.target_user_id
   for update;

  if not found then
    raise exception 'target account no longer exists';
  end if;

  if p_approve then
    if v_request.action_type = 'delete_member_account' then
      if v_target_role <> 'member' then
        raise exception 'target is no longer a regular member';
      end if;

      insert into public.admin_audit_logs(actor, action, target, detail)
      values (
        v_actor, 'delete_member_account_approved', v_request.target_user_id,
        pg_catalog.jsonb_build_object(
          'request_id', v_request.id,
          'requested_by', v_request.requester_id,
          'approved_by', v_actor,
          'username', v_target_username,
          'reason', v_request.reason
        )
      );

      delete from auth.users where id = v_request.target_user_id;
      if not found then
        raise exception 'auth account not found';
      end if;
    elsif v_request.action_type = 'set_role' then
      if v_target_role = 'super_admin'
         or v_request.requested_role not in ('member', 'admin')
         or v_request.requested_role = v_target_role then
        raise exception 'role change is no longer valid';
      end if;

      update public.profiles
         set role = v_request.requested_role
       where id = v_request.target_user_id;

      insert into public.admin_audit_logs(actor, action, target, detail)
      values (
        v_actor, 'set_role_approved', v_request.target_user_id,
        pg_catalog.jsonb_build_object(
          'request_id', v_request.id,
          'requested_by', v_request.requester_id,
          'approved_by', v_actor,
          'from', v_target_role,
          'to', v_request.requested_role,
          'reason', v_request.reason
        )
      );
    else
      raise exception 'unsupported action type';
    end if;

    update admin_private.sensitive_action_requests
       set status = 'approved',
           decided_by = v_actor,
           decided_at = pg_catalog.now(),
           decision_note = nullif(pg_catalog.btrim(p_note), '')
     where id = p_request_id;
  else
    update admin_private.sensitive_action_requests
       set status = 'rejected',
           decided_by = v_actor,
           decided_at = pg_catalog.now(),
           decision_note = nullif(pg_catalog.btrim(p_note), '')
     where id = p_request_id;

    insert into public.admin_audit_logs(actor, action, target, detail)
    values (
      v_actor, 'sensitive_action_rejected', v_request.target_user_id,
      pg_catalog.jsonb_build_object(
        'request_id', v_request.id,
        'requested_by', v_request.requester_id,
        'rejected_by', v_actor,
        'action_type', v_request.action_type,
        'note', nullif(pg_catalog.btrim(p_note), '')
      )
    );
  end if;
end;
$function$;

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

revoke all on function public.admin_request_sensitive_action(text, uuid, text, text) from public, anon;
grant execute on function public.admin_request_sensitive_action(text, uuid, text, text) to authenticated;
revoke all on function public.admin_decide_sensitive_action(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_sensitive_action(uuid, boolean, text) to authenticated;
revoke all on function public.admin_sensitive_action_requests() from public, anon;
grant execute on function public.admin_sensitive_action_requests() to authenticated;

-- Remove the old direct execution paths. Sensitive actions must now pass
-- through the request + independent approval flow above.
revoke all on function public.admin_delete_member_account(uuid) from public, anon, authenticated;
revoke all on function public.set_role(uuid, text) from public, anon, authenticated;

commit;
