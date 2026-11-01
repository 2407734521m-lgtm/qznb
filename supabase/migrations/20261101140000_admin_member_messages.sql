-- Allow administrators to send direct in-app messages to one or more members.
-- Uses the existing notifications inbox; no new table or external delivery provider.

create or replace function public.admin_send_member_message(
  p_title text,
  p_body text,
  p_recipient_ids uuid[],
  p_link text default '/me/notifications'
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_link text := coalesce(nullif(pg_catalog.btrim(p_link), ''), '/me/notifications');
  v_ids uuid[];
  v_requested_count integer;
  v_sent integer;
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if p_title is null
     or pg_catalog.char_length(pg_catalog.btrim(p_title)) < 1
     or pg_catalog.char_length(pg_catalog.btrim(p_title)) > 120
     or p_body is null
     or pg_catalog.char_length(pg_catalog.btrim(p_body)) < 1
     or pg_catalog.char_length(pg_catalog.btrim(p_body)) > 2000
     or pg_catalog.char_length(v_link) > 300
     or pg_catalog.left(v_link, 1) <> '/'
     or pg_catalog.left(v_link, 2) = '//' then
    raise exception 'invalid member message content or link' using errcode = '22023';
  end if;

  if p_recipient_ids is null
     or pg_catalog.cardinality(p_recipient_ids) < 1
     or pg_catalog.cardinality(p_recipient_ids) > 100
     or pg_catalog.array_position(p_recipient_ids, null::uuid) is not null then
    raise exception 'recipient count must be between 1 and 100' using errcode = '22023';
  end if;

  v_requested_count := pg_catalog.cardinality(p_recipient_ids);
  select pg_catalog.array_agg(distinct x.id order by x.id)
    into v_ids
    from unnest(p_recipient_ids) as x(id);

  if pg_catalog.cardinality(v_ids) <> v_requested_count then
    raise exception 'duplicate recipients are not allowed' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.admin_audit_logs l
    where l.actor = v_actor
      and l.action = 'admin_member_message_sent'
      and l.created_at >= pg_catalog.now() - interval '1 hour'
  ) >= 20 then
    raise exception 'member message rate limit reached' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.profiles p
    where p.id = any(v_ids)
      and p.role = 'member'
  ) <> v_requested_count then
    raise exception 'one or more recipients are unavailable or are not regular members' using errcode = '22023';
  end if;

  insert into public.notifications(profile_id, type, title, body, link, is_read)
  select
    x.id,
    'admin_message',
    pg_catalog.btrim(p_title),
    pg_catalog.btrim(p_body),
    v_link,
    false
  from unnest(v_ids) as x(id);

  get diagnostics v_sent = row_count;

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'admin_member_message_sent',
    pg_catalog.jsonb_build_object(
      'recipient_count', v_sent,
      'recipient_ids', v_ids,
      'title', pg_catalog.btrim(p_title),
      'scope', case when v_sent = 1 then 'single_member' else 'selected_members' end
    )
  );

  return v_sent;
end;
$function$;

revoke all on function public.admin_send_member_message(text, text, uuid[], text) from public, anon;
grant execute on function public.admin_send_member_message(text, text, uuid[], text) to authenticated;
