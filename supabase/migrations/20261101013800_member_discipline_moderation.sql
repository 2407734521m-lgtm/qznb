-- Member discipline and scoped interaction restrictions.
-- The moderation ledger stays in a non-exposed schema; clients can only use
-- the super-admin-guarded RPCs below.

create schema if not exists admin_private;

create table if not exists admin_private.member_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null check (
    action_type in ('warning', 'community_mute', 'chat_mute', 'interaction_suspend')
  ),
  reason text not null check (char_length(btrim(reason)) between 8 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revocation_reason text check (
    revocation_reason is null or char_length(btrim(revocation_reason)) between 8 and 300
  ),
  constraint member_moderation_warning_no_expiry
    check (action_type <> 'warning' or expires_at is null)
);

create index if not exists member_moderation_actions_target_created_idx
  on admin_private.member_moderation_actions (target_user_id, created_at desc);

create index if not exists member_moderation_actions_active_target_idx
  on admin_private.member_moderation_actions (target_user_id, action_type, expires_at)
  where revoked_at is null and action_type <> 'warning';

alter table admin_private.member_moderation_actions enable row level security;
revoke all on table admin_private.member_moderation_actions from public, anon, authenticated;

-- This helper is intentionally read-only. It returns false for unknown scopes
-- and is used by restrictive RLS policies as a second, non-bypassable check.
create or replace function public.member_moderation_allows(p_scope text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when p_scope not in ('community', 'chat') or auth.uid() is null then false
    else not exists (
      select 1
      from admin_private.member_moderation_actions a
      where a.target_user_id = auth.uid()
        and a.revoked_at is null
        and (a.expires_at is null or a.expires_at > pg_catalog.now())
        and (
          a.action_type = 'interaction_suspend'
          or (p_scope = 'community' and a.action_type = 'community_mute')
          or (p_scope = 'chat' and a.action_type = 'chat_mute')
        )
    )
  end;
$function$;

revoke all on function public.member_moderation_allows(text) from public, anon;
grant execute on function public.member_moderation_allows(text) to authenticated;

create or replace function public.admin_member_moderation(p_target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_target_user_id is null
     or not exists (
       select 1 from public.profiles p where p.id = p_target_user_id
     ) then
    raise exception 'target member not found' using errcode = '22023';
  end if;

  select pg_catalog.jsonb_build_object(
    'target_user_id', p_target_user_id,
    'actions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', a.id,
          'action_type', a.action_type,
          'reason', a.reason,
          'created_at', a.created_at,
          'expires_at', a.expires_at,
          'revoked_at', a.revoked_at,
          'revocation_reason', a.revocation_reason,
          'active', (
            a.action_type <> 'warning'
            and a.revoked_at is null
            and (a.expires_at is null or a.expires_at > pg_catalog.now())
          ),
          'actor_name', coalesce(actor.display_name, actor.username::text, '管理员'),
          'revoked_by_name', coalesce(revoker.display_name, revoker.username::text)
        )
        order by a.created_at desc
      )
      from admin_private.member_moderation_actions a
      left join public.profiles actor on actor.id = a.actor_id
      left join public.profiles revoker on revoker.id = a.revoked_by
      where a.target_user_id = p_target_user_id
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_member_moderation(uuid) from public, anon;
grant execute on function public.admin_member_moderation(uuid) to authenticated;

create or replace function public.admin_apply_member_moderation(
  p_target_user_id uuid,
  p_action_type text,
  p_reason text,
  p_duration_hours integer default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_target_role text;
  v_expires_at timestamptz;
  v_action_id uuid;
begin
  if v_actor is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_target_user_id is null
     or p_target_user_id = v_actor
     or p_action_type not in ('warning', 'community_mute', 'chat_mute', 'interaction_suspend')
     or p_reason is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 8
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 500 then
    raise exception 'invalid moderation request' using errcode = '22023';
  end if;

  select p.role
    into v_target_role
    from public.profiles p
   where p.id = p_target_user_id
   for update;

  if not found then
    raise exception 'target member not found' using errcode = '22023';
  end if;

  if v_target_role <> 'member' then
    raise exception 'moderation actions can only target regular members' using errcode = '42501';
  end if;

  if p_action_type = 'warning' then
    if p_duration_hours is not null then
      raise exception 'warnings do not have a duration' using errcode = '22023';
    end if;
    v_expires_at := null;
  else
    if p_duration_hours is not null
       and p_duration_hours not in (1, 24, 72, 168) then
      raise exception 'unsupported moderation duration' using errcode = '22023';
    end if;
    v_expires_at := case
      when p_duration_hours is null then null
      else pg_catalog.now() + pg_catalog.make_interval(hours => p_duration_hours)
    end;
  end if;

  insert into admin_private.member_moderation_actions (
    target_user_id, actor_id, action_type, reason, expires_at
  ) values (
    p_target_user_id, v_actor, p_action_type, pg_catalog.btrim(p_reason), v_expires_at
  )
  returning id into v_action_id;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'member_moderation_applied',
    p_target_user_id,
    pg_catalog.jsonb_build_object(
      'moderation_id', v_action_id,
      'action_type', p_action_type,
      'duration_hours', p_duration_hours,
      'expires_at', v_expires_at,
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  return v_action_id;
end;
$function$;

revoke all on function public.admin_apply_member_moderation(uuid, text, text, integer) from public, anon;
grant execute on function public.admin_apply_member_moderation(uuid, text, text, integer) to authenticated;

create or replace function public.admin_revoke_member_moderation(
  p_action_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_target_user_id uuid;
  v_action_type text;
begin
  if v_actor is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_action_id is null
     or p_reason is null
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 8
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 300 then
    raise exception 'invalid moderation release request' using errcode = '22023';
  end if;

  select a.target_user_id, a.action_type
    into v_target_user_id, v_action_type
    from admin_private.member_moderation_actions a
   where a.id = p_action_id
     and a.action_type <> 'warning'
     and a.revoked_at is null
     and (a.expires_at is null or a.expires_at > pg_catalog.now())
   for update;

  if not found then
    raise exception 'active moderation restriction not found' using errcode = '22023';
  end if;

  update admin_private.member_moderation_actions
     set revoked_at = pg_catalog.now(),
         revoked_by = v_actor,
         revocation_reason = pg_catalog.btrim(p_reason)
   where id = p_action_id;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'member_moderation_revoked',
    v_target_user_id,
    pg_catalog.jsonb_build_object(
      'moderation_id', p_action_id,
      'action_type', v_action_type,
      'reason', pg_catalog.btrim(p_reason)
    )
  );
end;
$function$;

revoke all on function public.admin_revoke_member_moderation(uuid, text) from public, anon;
grant execute on function public.admin_revoke_member_moderation(uuid, text) to authenticated;

-- Restrictive INSERT policies AND with the existing permissive policies, so
-- existing ownership, membership, and feature-flag checks remain in force.
create policy md_posts_insert_guard
  on public.posts as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_comments_insert_guard
  on public.comments as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_post_likes_insert_guard
  on public.post_likes as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_board_messages_insert_guard
  on public.board_messages as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_albums_insert_guard
  on public.albums as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_album_photos_insert_guard
  on public.album_photos as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_greetings_insert_guard
  on public.greetings as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_love_wall_posts_insert_guard
  on public.love_wall_posts as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_love_wall_comments_insert_guard
  on public.love_wall_comments as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_love_wall_media_insert_guard
  on public.love_wall_media as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_song_posts_insert_guard
  on public.song_posts as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

create policy md_wishes_insert_guard
  on public.wishes as restrictive for insert to authenticated
  with check (public.member_moderation_allows('community'));

-- Muted members may still remove their own content, but cannot edit it to
-- publish additional text while the restriction is active.
create policy md_posts_update_guard
  on public.posts as restrictive for update to authenticated
  using (public.member_moderation_allows('community'))
  with check (public.member_moderation_allows('community'));

create policy md_comments_update_guard
  on public.comments as restrictive for update to authenticated
  using (public.member_moderation_allows('community'))
  with check (public.member_moderation_allows('community'));

create policy md_love_wall_comments_update_guard
  on public.love_wall_comments as restrictive for update to authenticated
  using (public.member_moderation_allows('community'))
  with check (public.member_moderation_allows('community'));

create policy md_messages_insert_guard
  on public.messages as restrictive for insert to authenticated
  with check (public.member_moderation_allows('chat'));

create policy md_message_reactions_insert_guard
  on public.message_reactions as restrictive for insert to authenticated
  with check (public.member_moderation_allows('chat'));

-- These SECURITY DEFINER paths bypass table RLS, so they repeat the check.
create or replace function public.create_song_audio_upload(p_ext text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.site_feature_enabled('songs') then
    raise exception 'song feature is currently disabled' using errcode = '42501';
  end if;
  if not public.member_moderation_allows('community') then
    raise exception 'community posting is restricted by moderation' using errcode = '42501';
  end if;
  if p_ext is null or char_length(p_ext) < 1 or char_length(p_ext) > 10 or p_ext ~ '[^a-z0-9]' then
    raise exception 'invalid audio extension' using errcode = '22023';
  end if;

  perform 1 from public.profiles p where p.id = auth.uid() for update;
  if not found then
    raise exception 'member profile not found' using errcode = '42501';
  end if;

  delete from public.song_audio_uploads
  where created_at < now() - interval '1 day';

  if (
    select count(*) from public.song_audio_uploads u
    where u.profile_id = auth.uid()
      and u.created_at > now() - interval '15 minutes'
  ) >= 5 then
    raise exception 'too many audio upload attempts' using errcode = 'P0001';
  end if;

  v_path := 'songs/' || gen_random_uuid()::text || '.' || p_ext;
  insert into public.song_audio_uploads(path, profile_id)
  values (v_path, auth.uid());
  return v_path;
end;
$function$;

create or replace function public.edit_chat_message(p_message_id bigint, p_body text)
returns void
language plpgsql
security definer
set search_path to ''
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
