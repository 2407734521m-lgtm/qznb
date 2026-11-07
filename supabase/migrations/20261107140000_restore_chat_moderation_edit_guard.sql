-- SECURITY DEFINER edit RPCs bypass RLS; preserve the chat moderation gate.
begin;

create or replace function public.edit_chat_message(p_message_id bigint, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_message public.messages%rowtype;
  v_body text := pg_catalog.btrim(p_body);
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not authenticated or not a joined member' using errcode = '42501';
  end if;
  if not public.member_moderation_allows('chat') then
    raise exception 'chat messaging is restricted by moderation' using errcode = '42501';
  end if;
  if p_message_id is null
     or v_body is null
     or pg_catalog.char_length(v_body) < 1
     or pg_catalog.char_length(v_body) > 2000 then
    raise exception 'invalid message content';
  end if;

  select *
    into v_message
    from public.messages m
   where m.id = p_message_id
   for update;

  if not found
     or v_message.sender_id <> auth.uid()
     or not chat_private.is_conversation_member(v_message.conversation_id)
     or v_message.deleted_at is not null then
    raise exception 'message cannot be edited' using errcode = '42501';
  end if;

  if v_message.body like '[[im-image:%'
     or v_message.body like '[[im-audio:%' then
    raise exception 'media messages cannot be edited';
  end if;

  update public.messages
     set body = v_body,
         edited_at = pg_catalog.now()
   where id = p_message_id;
end;
$function$;

revoke all on function public.edit_chat_message(bigint, text) from public, anon;
grant execute on function public.edit_chat_message(bigint, text) to authenticated;

commit;
