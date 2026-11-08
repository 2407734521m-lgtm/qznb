-- Avoid emitting a Realtime UPDATE when a conversation's read cursors are unchanged.
-- This makes mark_conversation_read idempotent and prevents reload feedback loops.
begin;

create or replace function public.mark_conversation_read(p_conversation_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_last_message_id bigint;
  v_saved_message_id bigint;
  v_send_read_receipts boolean := true;
begin
  if auth.uid() is null
     or not public.is_member()
     or not chat_private.is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  if not public.site_feature_enabled('chat') then
    raise exception 'chat is currently unavailable';
  end if;

  select coalesce(
    p.preferences #> '{chat,sendReadReceipts}' <> 'false'::jsonb,
    true
  )
    into v_send_read_receipts
    from public.profile_notification_preferences p
   where p.profile_id = auth.uid();

  v_send_read_receipts := coalesce(v_send_read_receipts, true);

  select max(m.id)
    into v_last_message_id
    from public.messages m
   where m.conversation_id = p_conversation_id;

  if v_last_message_id is null then
    select cm.last_read_message_id
      into v_saved_message_id
      from public.conversation_members cm
     where cm.conversation_id = p_conversation_id
       and cm.profile_id = auth.uid();
    return v_saved_message_id;
  end if;

  update public.conversation_members cm
     set last_read_message_id = greatest(coalesce(cm.last_read_message_id, 0), v_last_message_id),
         last_receipt_message_id = case
           when v_send_read_receipts
             then greatest(coalesce(cm.last_receipt_message_id, 0), v_last_message_id)
           else cm.last_receipt_message_id
         end
   where cm.conversation_id = p_conversation_id
     and cm.profile_id = auth.uid()
     and (
       coalesce(cm.last_read_message_id, 0) < v_last_message_id
       or (v_send_read_receipts and coalesce(cm.last_receipt_message_id, 0) < v_last_message_id)
     )
  returning cm.last_read_message_id into v_saved_message_id;

  if v_saved_message_id is null then
    select cm.last_read_message_id
      into v_saved_message_id
      from public.conversation_members cm
     where cm.conversation_id = p_conversation_id
       and cm.profile_id = auth.uid();
  end if;

  return v_saved_message_id;
end;
$function$;

revoke all on function public.mark_conversation_read(bigint) from public, anon;
grant execute on function public.mark_conversation_read(bigint) to authenticated;

commit;
