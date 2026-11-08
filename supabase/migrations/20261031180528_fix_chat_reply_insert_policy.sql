-- Fix reply validation: qualify reply_to_id against the outer messages row.
-- Without this qualification PostgreSQL resolves it to parent.reply_to_id.
begin;

drop policy if exists m_ins on public.messages;

create policy m_ins on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and chat_private.is_conversation_member(conversation_id)
  and public.site_feature_enabled('chat')
  and (
    reply_to_id is null
    or exists (
      select 1
      from public.messages parent
      where parent.id = messages.reply_to_id
        and parent.conversation_id = messages.conversation_id
    )
  )
);

commit;
