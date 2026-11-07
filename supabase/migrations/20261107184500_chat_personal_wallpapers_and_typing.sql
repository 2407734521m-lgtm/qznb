-- Personal iMessage-style wallpaper and authenticated per-conversation typing signals.
begin;

alter table public.conversation_members
  add column if not exists chat_background text not null default 'default';

comment on column public.conversation_members.chat_background is
  'Per-member private chat wallpaper preset or private chat-media object path.';

create or replace function public.set_chat_background(
  p_conversation_id bigint,
  p_background text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_path text;
begin
  if auth.uid() is null
     or not public.is_member()
     or not chat_private.is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  if not public.site_feature_enabled('chat') then
    raise exception 'chat is currently unavailable';
  end if;

  if p_background is null or pg_catalog.char_length(p_background) > 600 then
    raise exception 'invalid chat background';
  end if;

  if p_background like 'image:%' then
    v_path := pg_catalog.substr(p_background, 7);
    if v_path not like p_conversation_id::text || '/' || auth.uid()::text || '/%'
       or pg_catalog.strpos(v_path, '..') > 0 then
      raise exception 'background image is not owned by this conversation member'
        using errcode = '42501';
    end if;
  elsif p_background not in ('default', 'sky', 'lavender', 'mint', 'sunset') then
    raise exception 'unsupported chat background';
  end if;

  update public.conversation_members
     set chat_background = p_background
   where conversation_id = p_conversation_id
     and profile_id = auth.uid();

  if not found then
    raise exception 'conversation member not found' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.set_chat_background(bigint, text) from public, anon;
grant execute on function public.set_chat_background(bigint, text) to authenticated;

-- The typing channel carries only a boolean; access is restricted to active
-- members of the conversation encoded in the topic and enabled chat sessions.
drop policy if exists chat_typing_member_read on realtime.messages;
create policy chat_typing_member_read
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.private is true
  and public.site_feature_enabled('chat')
  and case
    when (select realtime.topic()) ~ '^chat-typing:[0-9]+$'
    then chat_private.is_conversation_member(
      pg_catalog.split_part((select realtime.topic()), ':', 2)::bigint
    )
    else false
  end
);

drop policy if exists chat_typing_member_send on realtime.messages;
create policy chat_typing_member_send
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.private is true
  and case
    when (select realtime.topic()) ~ '^chat-typing:[0-9]+$'
    then chat_private.is_conversation_member(
      pg_catalog.split_part((select realtime.topic()), ':', 2)::bigint
    )
    else false
  end
);

commit;
