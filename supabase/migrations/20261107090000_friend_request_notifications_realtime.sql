-- Deliver friend requests through the notification center and refresh them in realtime.
begin;

-- Incoming requests should remain visible even if an older profile is missing
-- its optional privacy-preferences row. Names and avatars stay hidden by default.
create or replace function public.friend_requests()
returns table(id uuid, username text, display_name text, avatar_path text, created_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.id,
         p.username::text,
         case when coalesce(pr.show_name, false) then p.display_name end,
         case when coalesce(pr.show_avatar, false) then p.avatar_path end,
         f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.requester
  left join public.profile_privacy pr on pr.profile_id = p.id
  where public.is_member()
    and p.joined
    and f.status = 'pending'
    and f.addressee = auth.uid()
  order by f.created_at desc;
$function$;

revoke all on function public.friend_requests() from public, anon;
grant execute on function public.friend_requests() to authenticated;

-- Every newly-created pending request also creates a notification for the
-- recipient. The requester's ID in the link allows the notification to be
-- marked read when that exact request is accepted or rejected.
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ex text;
  v_pair text;
  v_requester_username text;
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
    update public.notifications
    set is_read = true
    where profile_id = auth.uid()
      and type = 'friend_request'
      and link = '/friends?tab=reqs&request=' || target::text;
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

  select p.username::text
    into v_requester_username
  from public.profiles p
  where p.id = auth.uid();

  insert into public.friendships (requester, addressee, status)
  values (auth.uid(), target, 'pending')
  on conflict (requester, addressee)
  do update set status = 'pending', created_at = pg_catalog.now();

  insert into public.notifications (profile_id, type, title, body, link, is_read)
  values (
    target,
    'friend_request',
    '新的好友申请',
    left('@' || coalesce(nullif(v_requester_username, ''), '同学') || ' 想加你为好友。', 100),
    '/friends?tab=reqs&request=' || auth.uid()::text,
    false
  );

  return 'sent';
end;
$function$;

revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- A completed response also clears the corresponding notification.
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

  update public.notifications
  set is_read = true
  where profile_id = auth.uid()
    and type = 'friend_request'
    and link = '/friends?tab=reqs&request=' || req::text;
end;
$function$;

revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Preserve the current user's notification choices and opt new accounts into
-- friend-request alerts by default.
alter table public.profile_notification_preferences
  alter column preferences set default
  '{"motion":"system","notifications":{"comment":true,"like":true,"greeting":true,"notice":true,"feedback":true,"love_wall":true,"admin_message":true,"friend_request":true}}'::jsonb;

update public.profile_notification_preferences
set preferences = jsonb_set(
  preferences,
  '{notifications}',
  coalesce(preferences -> 'notifications', '{}'::jsonb) || jsonb_build_object('friend_request', true),
  true
)
where not coalesce((preferences -> 'notifications') ? 'friend_request', false);

-- Notify users about requests that were already pending when this repair ships.
insert into public.notifications (profile_id, type, title, body, link, is_read)
select
  f.addressee,
  'friend_request',
  '新的好友申请',
  left('@' || coalesce(nullif(p.username::text, ''), '同学') || ' 想加你为好友。', 100),
  '/friends?tab=reqs&request=' || f.requester::text,
  false
from public.friendships f
join public.profiles p on p.id = f.requester
where f.status = 'pending'
  and not exists (
    select 1
    from public.notifications n
    where n.profile_id = f.addressee
      and n.type = 'friend_request'
      and n.link = '/friends?tab=reqs&request=' || f.requester::text
  );

-- Realtime requires publication membership as well as table SELECT policies.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'friendships'
    ) then
      execute 'alter publication supabase_realtime add table public.friendships';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  end if;
end;
$$;

commit;
