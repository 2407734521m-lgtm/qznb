-- Phase 5: private chat inbox, read receipts, replies, message management and reactions.
-- All writes are scoped to the authenticated conversation member.
begin;

alter table public.conversation_members
  add column if not exists last_read_message_id bigint;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_members_last_read_message_id_fkey'
      and conrelid = 'public.conversation_members'::regclass
  ) then
    alter table public.conversation_members
      add constraint conversation_members_last_read_message_id_fkey
      foreign key (last_read_message_id)
      references public.messages(id)
      on delete set null;
  end if;
end;
$constraint$;

alter table public.messages
  add column if not exists reply_to_id bigint,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_reply_to_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_reply_to_id_fkey
      foreign key (reply_to_id)
      references public.messages(id)
      on delete set null;
  end if;
end;
$constraint$;

create index if not exists messages_conversation_id_id_desc_idx
  on public.messages (conversation_id, id desc);

create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, reaction)
);

alter table public.message_reactions enable row level security;
revoke all on table public.message_reactions from public, anon;
grant select, insert, delete on table public.message_reactions to authenticated;

drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions
for select to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_id
      and chat_private.is_conversation_member(m.conversation_id)
  )
);

drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions
for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and public.site_feature_enabled('chat')
  and exists (
    select 1
    from public.messages m
    where m.id = message_id
      and m.deleted_at is null
      and chat_private.is_conversation_member(m.conversation_id)
  )
);

drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions
for delete to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.messages m
    where m.id = message_id
      and chat_private.is_conversation_member(m.conversation_id)
  )
);

-- A reply must point to a message in the same conversation.
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
      where parent.id = reply_to_id
        and parent.conversation_id = messages.conversation_id
    )
  )
);

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
    peer.last_read_message_id
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
begin
  if auth.uid() is null
     or not public.is_member()
     or not chat_private.is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  if not public.site_feature_enabled('chat') then
    raise exception 'chat is currently unavailable';
  end if;

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
     set last_read_message_id = greatest(
       coalesce(cm.last_read_message_id, v_last_message_id),
       v_last_message_id
     )
   where cm.conversation_id = p_conversation_id
     and cm.profile_id = auth.uid()
     and coalesce(cm.last_read_message_id, 0) < v_last_message_id
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

create or replace function public.delete_chat_message(p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_conversation_id bigint;
  v_sender_id uuid;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not authenticated or not a joined member' using errcode = '42501';
  end if;

  select m.conversation_id, m.sender_id
    into v_conversation_id, v_sender_id
    from public.messages m
   where m.id = p_message_id
     and m.deleted_at is null
   for update;

  if not found
     or v_sender_id <> auth.uid()
     or not chat_private.is_conversation_member(v_conversation_id) then
    raise exception 'message cannot be withdrawn' using errcode = '42501';
  end if;

  update public.messages
     set body = '',
         deleted_at = pg_catalog.now(),
         edited_at = null
   where id = p_message_id;

  delete from public.message_reactions
   where message_id = p_message_id;
end;
$function$;

revoke all on function public.delete_chat_message(bigint) from public, anon;
grant execute on function public.delete_chat_message(bigint) to authenticated;

-- Existing chat pages subscribe to Postgres Changes. Publish only the three
-- chat tables needed by inbox updates, read receipts and reaction updates.
do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
    ) then
      execute 'alter publication supabase_realtime add table public.conversation_members';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
    ) then
      execute 'alter publication supabase_realtime add table public.message_reactions';
    end if;
  end if;
end;
$publication$;

commit;
