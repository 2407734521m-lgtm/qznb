-- Split private-chat unread tracking from the peer-visible read-receipt cursor.
-- Quiet-hours preferences remain account-scoped JSON in profile_notification_preferences.
begin;

alter table public.conversation_members
  add column if not exists last_receipt_message_id bigint;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_members_last_receipt_message_id_fkey'
      and conrelid = 'public.conversation_members'::regclass
  ) then
    alter table public.conversation_members
      add constraint conversation_members_last_receipt_message_id_fkey
      foreign key (last_receipt_message_id)
      references public.messages(id)
      on delete set null;
  end if;
end;
$constraint$;

-- Preserve currently visible receipt status when introducing the separate cursor.
update public.conversation_members
   set last_receipt_message_id = last_read_message_id
 where last_receipt_message_id is null
   and last_read_message_id is not null;

comment on column public.conversation_members.last_read_message_id is
  'Private-chat inbox cursor; always advances to keep unread counts correct.';
comment on column public.conversation_members.last_receipt_message_id is
  'Peer-visible read receipt cursor; advances only when the member allows sending read receipts.';

create or replace function public.my_conversations()
returns table (
  conversation_id bigint,
  conversation_created_at timestamptz,
  other_profile_id uuid,
  username text,
  display_name text,
  avatar_path text,
  last_message_id bigint,
  last_message_body text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  last_message_deleted boolean,
  unread_count bigint,
  other_last_read_message_id bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    mine.conversation_id,
    c.created_at,
    peer.profile_id,
    p.username::text,
    case when pr.show_name then p.display_name else null end,
    case when pr.show_avatar then p.avatar_path else null end,
    latest.id,
    case when latest.deleted_at is null then latest.body else null end,
    latest.created_at,
    latest.sender_id,
    coalesce(latest.deleted_at is not null, false),
    (
      select count(*)::bigint
      from public.messages incoming
      where incoming.conversation_id = mine.conversation_id
        and incoming.sender_id <> auth.uid()
        and incoming.deleted_at is null
        and incoming.id > coalesce(mine.last_read_message_id, 0)
    ),
    peer.last_receipt_message_id
  from public.conversation_members mine
  join public.conversation_members peer
    on peer.conversation_id = mine.conversation_id
   and peer.profile_id <> mine.profile_id
  join public.conversations c
    on c.id = mine.conversation_id
  join public.profiles p
    on p.id = peer.profile_id
   and p.joined = true
  join public.profile_privacy pr
    on pr.profile_id = p.id
  left join lateral (
    select m.id, m.body, m.created_at, m.sender_id, m.deleted_at
    from public.messages m
    where m.conversation_id = mine.conversation_id
    order by m.id desc
    limit 1
  ) latest on true
  where auth.uid() is not null
    and public.is_member()
    and public.site_feature_enabled('chat')
    and mine.profile_id = auth.uid()
    and chat_private.is_conversation_member(mine.conversation_id)
  order by coalesce(latest.created_at, c.created_at) desc;
$function$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

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

  -- The private inbox cursor always advances. The public-to-peer receipt cursor
  -- advances only when this member has enabled sending read receipts.
  update public.conversation_members cm
     set last_read_message_id = greatest(
           coalesce(cm.last_read_message_id, v_last_message_id),
           v_last_message_id
         ),
         last_receipt_message_id = case
           when v_send_read_receipts then greatest(
             coalesce(cm.last_receipt_message_id, v_last_message_id),
             v_last_message_id
           )
           else cm.last_receipt_message_id
         end
   where cm.conversation_id = p_conversation_id
     and cm.profile_id = auth.uid()
  returning cm.last_read_message_id into v_saved_message_id;

  return v_saved_message_id;
end;
$function$;

revoke all on function public.mark_conversation_read(bigint) from public, anon;
grant execute on function public.mark_conversation_read(bigint) to authenticated;

commit;
