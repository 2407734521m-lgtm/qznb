-- 035: Enforce joined-member access and server-owned friendship state transitions.
-- Friendship changes must go through the RPCs; direct clients cannot create
-- accepted friendships or bypass the request/accept workflow.

-- A conversation member must still be an active joined member.
create schema if not exists chat_private;
revoke all on schema chat_private from public, anon;
grant usage on schema chat_private to authenticated;

create or replace function chat_private.is_conversation_member(cid bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and public.is_member()
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = cid
        and cm.profile_id = auth.uid()
    );
$function$;

revoke all on function chat_private.is_conversation_member(bigint) from public, anon;
grant execute on function chat_private.is_conversation_member(bigint) to authenticated;

-- Keep friend relationship rows readable only by joined users, and make all
-- writes go through the validated SECURITY DEFINER RPCs.
revoke all on public.friendships from public, anon, authenticated;
grant select on public.friendships to authenticated;
drop policy if exists f_ins on public.friendships;
drop policy if exists f_sel on public.friendships;
create policy f_sel on public.friendships
for select to authenticated
using (
  public.is_member()
  and (
    requester = (select auth.uid())
    or addressee = (select auth.uid())
  )
);
revoke usage, select on sequence public.friendships_id_seq from public, anon, authenticated;

-- The request/response RPCs are the only supported friendship write path.
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  ex text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_member() then
    raise exception 'not a joined member';
  end if;
  if target is null or target = auth.uid() then
    raise exception 'invalid target';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target and p.joined) then
    raise exception 'user not found';
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

create or replace function public.respond_friend_request(req uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_member() then
    raise exception 'not a joined member';
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

create or replace function public.friend_requests()
returns table(id uuid, username text, display_name text, avatar_path text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id,
         p.username::text,
         case when pr.show_name then p.display_name end,
         case when pr.show_avatar then p.avatar_path end,
         f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.requester
  join public.profile_privacy pr on pr.profile_id = p.id
  where public.is_member()
    and p.joined
    and f.status = 'pending'
    and f.addressee = auth.uid()
  order by f.created_at desc;
$function$;

create or replace function public.my_friends()
returns table(id uuid, username text, display_name text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id,
         p.username::text,
         case when pr.show_name then p.display_name end,
         case when pr.show_avatar then p.avatar_path end
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  join public.profile_privacy pr on pr.profile_id = p.id
  where public.is_member()
    and p.joined
    and f.status = 'accepted'
    and (f.requester = auth.uid() or f.addressee = auth.uid())
  order by f.created_at desc;
$function$;

create or replace function public.get_or_create_conversation(other uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
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
  if other is null or other = auth.uid() then
    raise exception 'invalid recipient';
  end if;
  if not exists (select 1 from public.profiles p where p.id = other and p.joined) then
    raise exception 'user not found';
  end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = other)
        or (f.requester = other and f.addressee = auth.uid()))
  ) then
    raise exception 'not friends';
  end if;

  v_pair := case
    when auth.uid()::text < other::text then auth.uid()::text || ':' || other::text
    else other::text || ':' || auth.uid()::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair, 0));

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

-- Apply the same membership gate to every chat RLS policy.
drop policy if exists cm_sel on public.conversation_members;
create policy cm_sel on public.conversation_members
for select to authenticated
using (chat_private.is_conversation_member(conversation_id));

drop policy if exists c_sel on public.conversations;
create policy c_sel on public.conversations
for select to authenticated
using (chat_private.is_conversation_member(id));

drop policy if exists m_ins on public.messages;
create policy m_ins on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and chat_private.is_conversation_member(conversation_id)
);

drop policy if exists m_sel on public.messages;
create policy m_sel on public.messages
for select to authenticated
using (chat_private.is_conversation_member(conversation_id));

-- Chat media must use the same authorization gate, including for Storage list/read.
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and chat_private.is_conversation_member(split_part(name, '/', 1)::bigint)
);

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and chat_private.is_conversation_member(split_part(name, '/', 1)::bigint)
);

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-media'
  and chat_private.is_conversation_member(split_part(name, '/', 1)::bigint)
);

drop function public.is_conversation_member(bigint);
