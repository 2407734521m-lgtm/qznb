-- 040: Self-service friendship controls.
-- Blocks are private to their owner. All transitions are SECURITY DEFINER RPCs;
-- a block removes any pending/accepted relationship and cuts off private chat
-- access without deleting the historical conversation or its messages.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  constraint user_blocks_pkey primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id, blocker_id);

alter table public.user_blocks enable row level security;
revoke all on table public.user_blocks from public, anon, authenticated;

create or replace function public.remove_friend(target uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_deleted integer;
  v_pair text;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not authenticated or not a joined member' using errcode = '42501';
  end if;
  if target is null or target = auth.uid() then
    raise exception 'invalid target' using errcode = '22023';
  end if;

  v_pair := case
    when auth.uid()::text < target::text then auth.uid()::text || ':' || target::text
    else target::text || ':' || auth.uid()::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair, 0));

  delete from public.friendships f
   where f.status = 'accepted'
     and ((f.requester = auth.uid() and f.addressee = target)
       or (f.requester = target and f.addressee = auth.uid()));
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'accepted friendship not found' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

create or replace function public.block_member(target uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pair text;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not authenticated or not a joined member' using errcode = '42501';
  end if;
  if target is null or target = auth.uid() then
    raise exception 'invalid target' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target) then
    raise exception 'member not found' using errcode = '22023';
  end if;

  v_pair := case
    when auth.uid()::text < target::text then auth.uid()::text || ':' || target::text
    else target::text || ':' || auth.uid()::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair, 0));

  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), target)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Clear accepted friendships and pending requests in either direction.
  delete from public.friendships f
   where (f.requester = auth.uid() and f.addressee = target)
      or (f.requester = target and f.addressee = auth.uid());
end;
$function$;

revoke all on function public.block_member(uuid) from public, anon;
grant execute on function public.block_member(uuid) to authenticated;

create or replace function public.unblock_member(target uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pair text;
  v_deleted integer;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not authenticated or not a joined member' using errcode = '42501';
  end if;
  if target is null or target = auth.uid() then
    raise exception 'invalid target' using errcode = '22023';
  end if;

  v_pair := case
    when auth.uid()::text < target::text then auth.uid()::text || ':' || target::text
    else target::text || ':' || auth.uid()::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair, 0));

  delete from public.user_blocks b
   where b.blocker_id = auth.uid()
     and b.blocked_id = target;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'block relationship not found' using errcode = '22023';
  end if;
  -- Unblocking does not silently recreate a friendship or message access.
end;
$function$;

revoke all on function public.unblock_member(uuid) from public, anon;
grant execute on function public.unblock_member(uuid) to authenticated;

create or replace function public.my_blocked_members()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p.id,
    p.username::text,
    case when pr.show_name then p.display_name else null end,
    case when pr.show_avatar then p.avatar_path else null end,
    b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  join public.profile_privacy pr on pr.profile_id = p.id
  where auth.uid() is not null
    and public.is_member()
    and b.blocker_id = auth.uid()
  order by b.created_at desc;
$function$;

revoke all on function public.my_blocked_members() from public, anon;
grant execute on function public.my_blocked_members() to authenticated;

create or replace function public.relationship_state(target uuid)
returns table (
  friend_status text,
  friend_requester uuid,
  blocked_by_me boolean,
  blocked_me boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (
      select f.status::text
      from public.friendships f
      where (f.requester = auth.uid() and f.addressee = target)
         or (f.requester = target and f.addressee = auth.uid())
      order by case f.status when 'accepted' then 0 when 'pending' then 1 else 2 end
      limit 1
    ),
    (
      select f.requester
      from public.friendships f
      where (f.requester = auth.uid() and f.addressee = target)
         or (f.requester = target and f.addressee = auth.uid())
      order by case f.status when 'accepted' then 0 when 'pending' then 1 else 2 end
      limit 1
    ),
    exists (
      select 1 from public.user_blocks b
      where b.blocker_id = auth.uid() and b.blocked_id = target
    ),
    exists (
      select 1 from public.user_blocks b
      where b.blocker_id = target and b.blocked_id = auth.uid()
    )
  from public.profiles p
  where auth.uid() is not null
    and public.is_member()
    and target is not null
    and target <> auth.uid()
    and p.id = target
    and p.joined = true;
$function$;

revoke all on function public.relationship_state(uuid) from public, anon;
grant execute on function public.relationship_state(uuid) to authenticated;

-- Friendship and chat SECURITY DEFINER entry points must also honor blocks.
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ex text;
  v_pair text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_member() then
    raise exception 'not a joined member';
  end if;
  if not public.member_moderation_allows('friendship') then
    raise exception 'friend requests are restricted by moderation' using errcode = '42501';
  end if;
  if target is null or target = auth.uid() then
    raise exception 'invalid target';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target and p.joined) then
    raise exception 'user not found';
  end if;

  v_pair := case
    when auth.uid()::text < target::text then auth.uid()::text || ':' || target::text
    else target::text || ':' || auth.uid()::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair, 0));

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = target)
       or (b.blocker_id = target and b.blocked_id = auth.uid())
  ) then
    raise exception 'friend request unavailable because one of you has blocked the other' using errcode = '42501';
  end if;

  update public.friendships
  set status = 'accepted'
  where requester = target
    and addressee = auth.uid()
    and status = 'pending';
  if found then
    return 'accepted';
  end if;

  select case
    when bool_or(status = 'accepted') then 'accepted'
    when bool_or(status = 'pending') then 'pending'
    else null
  end
  into ex
  from public.friendships
  where (requester = auth.uid() and addressee = target)
     or (requester = target and addressee = auth.uid());

  if ex = 'accepted' then return 'already_friends'; end if;
  if ex = 'pending' then return 'already_pending'; end if;

  insert into public.friendships (requester, addressee, status)
  values (auth.uid(), target, 'pending')
  on conflict (requester, addressee)
  do update set status = 'pending', created_at = pg_catalog.now();

  return 'sent';
end;
$function$;

revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_friend_request(req uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pair text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_member() then
    raise exception 'not a joined member';
  end if;
  if not public.member_moderation_allows('friendship') then
    raise exception 'friend request actions are restricted by moderation' using errcode = '42501';
  end if;
  if req is null or req = auth.uid() then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  v_pair := case
    when auth.uid()::text < req::text then auth.uid()::text || ':' || req::text
    else req::text || ':' || auth.uid()::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair, 0));

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = req)
       or (b.blocker_id = req and b.blocked_id = auth.uid())
  ) then
    raise exception 'friend request unavailable because one of you has blocked the other' using errcode = '42501';
  end if;

  update public.friendships f
  set status = case when accept then 'accepted' else 'rejected' end
  where f.requester = req
    and f.addressee = auth.uid()
    and f.status = 'pending'
    and exists (
      select 1 from public.profiles p
      where p.id = f.requester and p.joined
    );
  if not found then
    raise exception 'request not found';
  end if;
end;
$function$;

revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.get_or_create_conversation(other uuid)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cid bigint;
  v_pair text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_member() then
    raise exception 'not a joined member';
  end if;
  if not public.member_moderation_allows('chat') then
    raise exception 'private messaging is restricted by moderation' using errcode = '42501';
  end if;
  if other is null or other = auth.uid() then
    raise exception 'invalid recipient';
  end if;
  if not exists (select 1 from public.profiles p where p.id = other and p.joined) then
    raise exception 'user not found';
  end if;

  v_pair := case
    when auth.uid()::text < other::text then auth.uid()::text || ':' || other::text
    else other::text || ':' || auth.uid()::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair, 0));

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  ) then
    raise exception 'private conversation unavailable because one of you has blocked the other' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = other)
        or (f.requester = other and f.addressee = auth.uid()))
  ) then
    raise exception 'not friends';
  end if;

  select cm.conversation_id into cid
  from public.conversation_members cm
  join public.conversation_members cm2
    on cm2.conversation_id = cm.conversation_id
   and cm2.profile_id = other
  where cm.profile_id = auth.uid()
  limit 1;

  if cid is null then
    insert into public.conversations default values returning id into cid;
    insert into public.conversation_members (conversation_id, profile_id)
    values (cid, auth.uid()), (cid, other);
  end if;

  return cid;
end;
$function$;

revoke all on function public.get_or_create_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- Existing conversation URLs and storage access become unusable as soon as
-- either person blocks the other or the friendship is removed.
create or replace function chat_private.is_conversation_member(cid bigint)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select auth.uid() is not null
    and public.is_member()
    and exists (
      select 1
      from public.conversation_members mine
      where mine.conversation_id = cid
        and mine.profile_id = auth.uid()
    )
    and exists (
      select 1
      from public.conversation_members peer
      join public.friendships f
        on f.status = 'accepted'
       and (
         (f.requester = auth.uid() and f.addressee = peer.profile_id)
         or (f.requester = peer.profile_id and f.addressee = auth.uid())
       )
      where peer.conversation_id = cid
        and peer.profile_id <> auth.uid()
    )
    and not exists (
      select 1
      from public.conversation_members peer
      join public.user_blocks b
        on (b.blocker_id = auth.uid() and b.blocked_id = peer.profile_id)
        or (b.blocker_id = peer.profile_id and b.blocked_id = auth.uid())
      where peer.conversation_id = cid
        and peer.profile_id <> auth.uid()
    );
$function$;

revoke all on function chat_private.is_conversation_member(bigint) from public, anon;
grant execute on function chat_private.is_conversation_member(bigint) to authenticated;

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
    and chat_private.is_conversation_member(mine.conversation_id)
  order by coalesce(latest.created_at, c.created_at) desc;
$function$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;
