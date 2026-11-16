-- 私聊会话隐藏（微交互线 D，第二波在 Friends.tsx 做左滑隐藏的前置接口）。
-- 隐藏只是“自己看不见”：不删会话、不删消息、不影响对方，也不在未读数里出现；
-- 对方（或自己）发来新消息时，messages 上的触发器自动删掉该会话的全部隐藏行，
-- 双方的会话列表里都会重新出现这条会话。
-- 回滚：drop table public.conversation_hides cascade 会连同策略与触发器函数引用
-- 一起清掉；my_conversations() 需另用 20261107103000 的定义 create or replace 还原；
-- 触发器可单独 drop trigger messages_unhide_conversation on public.messages。
begin;

create table if not exists public.conversation_hides (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  hidden_at timestamptz not null default pg_catalog.now(),
  constraint conversation_hides_pkey primary key (profile_id, conversation_id)
);

comment on table public.conversation_hides is
  'Per-user hidden private conversations. Hiding only removes the conversation from the owner''s own inbox list; it never deletes the conversation, its messages, or the peer''s view. Any new message in the conversation clears the hide for both members (see messages_unhide_conversation).';

create index if not exists conversation_hides_conversation_id_idx
  on public.conversation_hides (conversation_id, profile_id);

alter table public.conversation_hides enable row level security;
revoke all on table public.conversation_hides from public, anon;
grant select, insert, update, delete on table public.conversation_hides to authenticated;

drop policy if exists conversation_hides_select_own on public.conversation_hides;
create policy conversation_hides_select_own on public.conversation_hides
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists conversation_hides_insert_own on public.conversation_hides;
create policy conversation_hides_insert_own on public.conversation_hides
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists conversation_hides_update_own on public.conversation_hides;
create policy conversation_hides_update_own on public.conversation_hides
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists conversation_hides_delete_own on public.conversation_hides;
create policy conversation_hides_delete_own on public.conversation_hides
  for delete to authenticated using (profile_id = auth.uid());

create or replace function public.hide_conversation(p_conversation_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not authenticated or not a joined member' using errcode = '42501';
  end if;
  if p_conversation_id is null then
    raise exception 'invalid conversation' using errcode = '22023';
  end if;
  if not chat_private.is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  insert into public.conversation_hides (profile_id, conversation_id)
  values (auth.uid(), p_conversation_id)
  on conflict (profile_id, conversation_id) do nothing;
end;
$function$;

revoke all on function public.hide_conversation(bigint) from public, anon;
grant execute on function public.hide_conversation(bigint) to authenticated;

create or replace function public.unhide_conversation(p_conversation_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not authenticated or not a joined member' using errcode = '42501';
  end if;
  if p_conversation_id is null then
    raise exception 'invalid conversation' using errcode = '22023';
  end if;
  if not chat_private.is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  -- Silent when there is nothing to unhide: a new message may already have
  -- cleared the hide through the trigger below, and that must not surface
  -- as an error in the inbox UI.
  delete from public.conversation_hides
   where profile_id = auth.uid()
     and conversation_id = p_conversation_id;
end;
$function$;

revoke all on function public.unhide_conversation(bigint) from public, anon;
grant execute on function public.unhide_conversation(bigint) to authenticated;

-- my_conversations(): same signature and columns as
-- 20261107103000_chat_read_receipt_and_quiet_hours.sql, plus one filter:
-- conversations the caller hid are excluded from the inbox list (and therefore
-- from the Dock unread badge in App.tsx and from the new-message island alert,
-- both of which read unread_count from this RPC).
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
    and not exists (
      select 1
      from public.conversation_hides h
      where h.profile_id = auth.uid()
        and h.conversation_id = mine.conversation_id
    )
  order by coalesce(latest.created_at, c.created_at) desc;
$function$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- Messages are sent by direct insert into public.messages (see Chat.tsx), not
-- through an RPC, so the unhide-on-new-message rule has to live here as a
-- trigger. SECURITY DEFINER so it can delete both members' hide rows even
-- though the table's RLS policies only allow a user to touch their own rows.
create or replace function public.unhide_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.conversation_hides
   where conversation_id = new.conversation_id;
  return new;
end;
$function$;

revoke all on function public.unhide_conversation_on_message() from public, anon, authenticated, service_role;
drop trigger if exists messages_unhide_conversation on public.messages;
create trigger messages_unhide_conversation
  after insert on public.messages
  for each row execute function public.unhide_conversation_on_message();

commit;
