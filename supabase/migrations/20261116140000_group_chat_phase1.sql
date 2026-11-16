-- Group chat phase 1: multi-member conversations on the existing chat tables.
-- Direct conversations remain unchanged; group membership reuses conversation_members.
begin;

alter table public.conversations
  add column if not exists conversation_type text not null default 'direct',
  add column if not exists group_name text,
  add column if not exists group_avatar_path text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_type_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_type_check
      check (conversation_type in ('direct', 'group'));
  end if;
end $$;

alter table public.conversation_members
  add column if not exists member_role text not null default 'member',
  add column if not exists joined_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_members_role_check'
      and conrelid = 'public.conversation_members'::regclass
  ) then
    alter table public.conversation_members
      add constraint conversation_members_role_check
      check (member_role in ('owner', 'admin', 'member'));
  end if;
end $$;

create index if not exists conversations_type_updated_idx
  on public.conversations (conversation_type, updated_at desc);
create index if not exists conversation_members_profile_conversation_idx
  on public.conversation_members (profile_id, conversation_id);

comment on column public.conversations.conversation_type is 'direct or group; direct remains the default for existing and new one-to-one chats.';
comment on column public.conversation_members.member_role is 'Group role: owner, admin, or member. Direct conversation rows remain member.';

-- A group may only be created with already accepted friends. This prevents
-- arbitrary account discovery/invites and preserves qznb's existing friend model.
create or replace function public.create_group_conversation(
  p_group_name text,
  p_member_ids uuid[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cid bigint;
  v_ids uuid[];
  v_count integer;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not authenticated or not a joined member' using errcode = '42501';
  end if;
  if not public.site_feature_enabled('chat') then
    raise exception 'chat is currently unavailable';
  end if;
  if p_group_name is null or char_length(btrim(p_group_name)) not between 1 and 40 then
    raise exception 'group name must be between 1 and 40 characters' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), array[]::uuid[])
    into v_ids
    from unnest(coalesce(p_member_ids, array[]::uuid[])) x
   where x is not null and x <> auth.uid();
  v_count := coalesce(cardinality(v_ids), 0);
  if v_count < 1 or v_count > 49 then
    raise exception 'a group must contain 2 to 50 members including you' using errcode = '22023';
  end if;

  if exists (
    select 1
      from unnest(v_ids) requested(id)
      left join public.profiles p on p.id = requested.id and p.joined = true
     where p.id is null
  ) then
    raise exception 'one or more members are unavailable';
  end if;

  if exists (
    select 1
      from unnest(v_ids) requested(id)
     where not exists (
       select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester = auth.uid() and f.addressee = requested.id)
            or (f.requester = requested.id and f.addressee = auth.uid()))
     )
  ) then
    raise exception 'all invited members must be your friends';
  end if;

  insert into public.conversations
    (conversation_type, group_name, created_by, updated_at)
  values ('group', btrim(p_group_name), auth.uid(), pg_catalog.now())
  returning id into v_cid;

  insert into public.conversation_members (conversation_id, profile_id, member_role)
  values (v_cid, auth.uid(), 'owner');

  insert into public.conversation_members (conversation_id, profile_id, member_role)
  select v_cid, x, 'member' from unnest(v_ids) x;

  return v_cid;
end;
$function$;

revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

create or replace function public.my_group_conversations()
returns table (
  conversation_id bigint,
  conversation_created_at timestamptz,
  group_name text,
  group_avatar_path text,
  member_count bigint,
  last_message_id bigint,
  last_message_body text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  last_message_deleted boolean,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id,
         c.created_at,
         c.group_name,
         c.group_avatar_path,
         (select count(*)::bigint from public.conversation_members count_members
           where count_members.conversation_id = c.id),
         latest.id,
         case when latest.deleted_at is null then latest.body else null end,
         latest.created_at,
         latest.sender_id,
         coalesce(latest.deleted_at is not null, false),
         (select count(*)::bigint
            from public.messages incoming
           where incoming.conversation_id = c.id
             and incoming.sender_id <> auth.uid()
             and incoming.deleted_at is null
             and incoming.id > coalesce(mine.last_read_message_id, 0))
    from public.conversations c
    join public.conversation_members mine
      on mine.conversation_id = c.id and mine.profile_id = auth.uid()
    left join lateral (
      select m.id, m.body, m.created_at, m.sender_id, m.deleted_at
        from public.messages m
       where m.conversation_id = c.id
       order by m.id desc limit 1
    ) latest on true
   where auth.uid() is not null
     and public.is_member()
     and public.site_feature_enabled('chat')
     and c.conversation_type = 'group'
     and chat_private.is_conversation_member(c.id)
     and not exists (
       select 1 from public.conversation_hides h
        where h.profile_id = auth.uid() and h.conversation_id = c.id
     )
   order by coalesce(latest.created_at, c.created_at) desc;
$function$;

revoke all on function public.my_group_conversations() from public, anon;
grant execute on function public.my_group_conversations() to authenticated;

create or replace function public.get_group_conversation_details(p_conversation_id bigint)
returns table (
  conversation_id bigint,
  group_name text,
  group_avatar_path text,
  created_by uuid,
  member_count bigint,
  my_role text,
  members jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id, c.group_name, c.group_avatar_path, c.created_by,
         (select count(*)::bigint from public.conversation_members cm
           where cm.conversation_id = c.id),
         mine.member_role,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'username', p.username::text,
             'display_name', case when privacy.show_name then p.display_name else null end,
             'avatar_path', case when privacy.show_avatar then p.avatar_path else null end,
             'role', cm.member_role,
             'joined_at', cm.joined_at
           ) order by case cm.member_role when 'owner' then 0 when 'admin' then 1 else 2 end, cm.joined_at)
             from public.conversation_members cm
             join public.profiles p on p.id = cm.profile_id and p.joined = true
             join public.profile_privacy privacy on privacy.profile_id = p.id
            where cm.conversation_id = c.id
         ), '[]'::jsonb)
    from public.conversations c
    join public.conversation_members mine
      on mine.conversation_id = c.id and mine.profile_id = auth.uid()
   where c.id = p_conversation_id
     and c.conversation_type = 'group'
     and auth.uid() is not null
     and public.is_member()
     and public.site_feature_enabled('chat')
     and chat_private.is_conversation_member(c.id);
$function$;

revoke all on function public.get_group_conversation_details(bigint) from public, anon;
grant execute on function public.get_group_conversation_details(bigint) to authenticated;

create or replace function public.rename_group_conversation(p_conversation_id bigint, p_group_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_member()
     or not public.site_feature_enabled('chat') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_group_name is null or char_length(btrim(p_group_name)) not between 1 and 40 then
    raise exception 'group name must be between 1 and 40 characters' using errcode = '22023';
  end if;
  update public.conversations c
     set group_name = btrim(p_group_name), updated_at = pg_catalog.now()
    from public.conversation_members cm
   where c.id = p_conversation_id
     and c.conversation_type = 'group'
     and cm.conversation_id = c.id
     and cm.profile_id = auth.uid()
     and cm.member_role in ('owner', 'admin');
  if not found then raise exception 'group not found or insufficient permissions' using errcode = '42501'; end if;
end;
$function$;

create or replace function public.add_group_members(p_conversation_id bigint, p_member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
  v_added integer := 0;
begin
  if auth.uid() is null or not public.is_member()
     or not public.site_feature_enabled('chat')
     or not exists (
       select 1 from public.conversations c
       join public.conversation_members mine on mine.conversation_id = c.id
       where c.id = p_conversation_id and c.conversation_type = 'group'
         and mine.profile_id = auth.uid() and mine.member_role in ('owner', 'admin')
     ) then
    raise exception 'not authorized to add group members' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), array[]::uuid[])
    into v_ids from unnest(coalesce(p_member_ids, array[]::uuid[])) x
   where x is not null and x <> auth.uid();

  if cardinality(v_ids) = 0 then return 0; end if;
  if exists (
    select 1 from unnest(v_ids) requested(id)
    left join public.profiles p on p.id = requested.id and p.joined = true
    where p.id is null
  ) then raise exception 'one or more members are unavailable'; end if;
  if exists (
    select 1 from unnest(v_ids) requested(id)
    where not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = auth.uid() and f.addressee = requested.id)
          or (f.requester = requested.id and f.addressee = auth.uid()))
    )
  ) then raise exception 'you can only invite your friends'; end if;

  if (select count(*) from public.conversation_members cm where cm.conversation_id = p_conversation_id)
      + (select count(*) from unnest(v_ids) x where not exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = p_conversation_id and cm.profile_id = x
        )) > 50 then
    raise exception 'group member limit is 50';
  end if;

  insert into public.conversation_members (conversation_id, profile_id, member_role)
  select p_conversation_id, x, 'member'
    from unnest(v_ids) x
   where not exists (
     select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.profile_id = x
   );
  get diagnostics v_added = row_count;
  update public.conversations set updated_at = pg_catalog.now() where id = p_conversation_id;
  return v_added;
end;
$function$;

create or replace function public.remove_group_member(p_conversation_id bigint, p_target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_target_role text;
begin
  if auth.uid() is null or p_target_profile_id is null
     or not public.is_member()
     or not public.site_feature_enabled('chat') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select member_role into v_actor_role
    from public.conversation_members
   where conversation_id = p_conversation_id and profile_id = auth.uid();
  select member_role into v_target_role
    from public.conversation_members
   where conversation_id = p_conversation_id and profile_id = p_target_profile_id;
  if v_actor_role not in ('owner', 'admin') or v_target_role is null
     or p_target_profile_id = auth.uid()
     or (v_actor_role = 'admin' and v_target_role in ('owner', 'admin')) then
    raise exception 'insufficient permissions' using errcode = '42501';
  end if;
  delete from public.conversation_members
   where conversation_id = p_conversation_id and profile_id = p_target_profile_id;
  update public.conversations set updated_at = pg_catalog.now() where id = p_conversation_id;
end;
$function$;

create or replace function public.leave_group_conversation(p_conversation_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_role text;
begin
  if auth.uid() is null or not public.is_member()
     or not public.site_feature_enabled('chat') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select cm.member_role into v_role
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
   where cm.conversation_id = p_conversation_id
     and cm.profile_id = auth.uid()
     and c.conversation_type = 'group';
  if v_role is null then raise exception 'not a group member' using errcode = '42501'; end if;
  if v_role = 'owner' then
    raise exception 'transfer ownership before leaving the group' using errcode = '22023';
  end if;
  delete from public.conversation_members
   where conversation_id = p_conversation_id and profile_id = auth.uid();
end;
$function$;

create or replace function public.transfer_group_ownership(p_conversation_id bigint, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or p_new_owner is null or p_new_owner = auth.uid()
     or not public.is_member() or not public.site_feature_enabled('chat') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.conversations c
    join public.conversation_members owner_row on owner_row.conversation_id = c.id
    join public.conversation_members target_row on target_row.conversation_id = c.id
    where c.id = p_conversation_id and c.conversation_type = 'group'
      and owner_row.profile_id = auth.uid() and owner_row.member_role = 'owner'
      and target_row.profile_id = p_new_owner
  ) then
    raise exception 'only the group owner can transfer ownership to a current member' using errcode = '42501';
  end if;
  update public.conversation_members
     set member_role = case when profile_id = p_new_owner then 'owner' else 'member' end
   where conversation_id = p_conversation_id
     and profile_id in (auth.uid(), p_new_owner);
  update public.conversations set created_by = p_new_owner, updated_at = pg_catalog.now()
   where id = p_conversation_id;
end;
$function$;

revoke all on function public.rename_group_conversation(bigint, text) from public, anon;
revoke all on function public.add_group_members(bigint, uuid[]) from public, anon;
revoke all on function public.remove_group_member(bigint, uuid) from public, anon;
revoke all on function public.leave_group_conversation(bigint) from public, anon;
revoke all on function public.transfer_group_ownership(bigint, uuid) from public, anon;
grant execute on function public.rename_group_conversation(bigint, text) to authenticated;
grant execute on function public.add_group_members(bigint, uuid[]) to authenticated;
grant execute on function public.remove_group_member(bigint, uuid) to authenticated;
grant execute on function public.leave_group_conversation(bigint) to authenticated;
grant execute on function public.transfer_group_ownership(bigint, uuid) to authenticated;

-- The existing private typing channel uses chat-typing:<conversation_id>.
-- Keep it private and authorize both directions only for active members.
drop policy if exists chat_typing_broadcast_read on realtime.messages;
create policy chat_typing_broadcast_read on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() ~ '^chat-typing:[0-9]+$'
  and chat_private.is_conversation_member(split_part(realtime.topic(), ':', 2)::bigint)
);
drop policy if exists chat_typing_broadcast_write on realtime.messages;
create policy chat_typing_broadcast_write on realtime.messages
for insert to authenticated
with check (
  extension = 'broadcast'
  and realtime.topic() ~ '^chat-typing:[0-9]+$'
  and chat_private.is_conversation_member(split_part(realtime.topic(), ':', 2)::bigint)
);

-- Restrict the direct inbox RPC to direct conversations so a group never
-- fans out into one duplicate row per other member.
-- Keep the established return shape stable for existing clients.
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
  select mine.conversation_id, c.created_at, peer.profile_id, p.username::text,
         case when pr.show_name then p.display_name else null end,
         case when pr.show_avatar then p.avatar_path else null end,
         latest.id,
         case when latest.deleted_at is null then latest.body else null end,
         latest.created_at, latest.sender_id,
         coalesce(latest.deleted_at is not null, false),
         (select count(*)::bigint from public.messages incoming
           where incoming.conversation_id = mine.conversation_id
             and incoming.sender_id <> auth.uid()
             and incoming.deleted_at is null
             and incoming.id > coalesce(mine.last_read_message_id, 0)),
         peer.last_receipt_message_id
    from public.conversation_members mine
    join public.conversation_members peer
      on peer.conversation_id = mine.conversation_id
     and peer.profile_id <> mine.profile_id
    join public.conversations c on c.id = mine.conversation_id
    join public.profiles p on p.id = peer.profile_id and p.joined = true
    join public.profile_privacy pr on pr.profile_id = p.id
    left join lateral (
      select m.id, m.body, m.created_at, m.sender_id, m.deleted_at
        from public.messages m
       where m.conversation_id = mine.conversation_id
       order by m.id desc limit 1
    ) latest on true
   where auth.uid() is not null
     and public.is_member()
     and public.site_feature_enabled('chat')
     and mine.profile_id = auth.uid()
     and c.conversation_type = 'direct'
     and chat_private.is_conversation_member(mine.conversation_id)
     and not exists (
       select 1 from public.conversation_hides h
        where h.profile_id = auth.uid() and h.conversation_id = mine.conversation_id
     )
   order by coalesce(latest.created_at, c.created_at) desc;
$function$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- Existing get_or_create_conversation must never return a group id.
create or replace function public.get_or_create_conversation(other uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare cid bigint; v_pair text;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not authenticated or not a joined member'; end if;
  if other is null or other = auth.uid() then raise exception 'invalid recipient'; end if;
  if not exists (select 1 from public.profiles p where p.id = other and p.joined) then raise exception 'user not found'; end if;
  if not exists (
    select 1 from public.friendships f where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = other) or (f.requester = other and f.addressee = auth.uid()))
  ) then raise exception 'not friends'; end if;
  v_pair := case when auth.uid()::text < other::text
    then auth.uid()::text || ':' || other::text else other::text || ':' || auth.uid()::text end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair, 0));
  select cm.conversation_id into cid
    from public.conversation_members cm
    join public.conversation_members cm2 on cm2.conversation_id = cm.conversation_id and cm2.profile_id = other
    join public.conversations c on c.id = cm.conversation_id and c.conversation_type = 'direct'
   where cm.profile_id = auth.uid()
   limit 1;
  if cid is null then
    insert into public.conversations default values returning id into cid;
    insert into public.conversation_members (conversation_id, profile_id) values (cid, auth.uid()), (cid, other);
  end if;
  return cid;
end;
$function$;
revoke all on function public.get_or_create_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

commit;
