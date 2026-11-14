-- Priority reliability/privacy fixes for the 2026-11-14 code review.
-- Additive only; do not edit previously applied migration history.
begin;

-- The later quiet-hours migration replaced the earlier no-op guard. Without
-- this predicate two open clients can keep triggering one another's reads.
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

  update public.conversation_members cm
     set last_read_message_id = greatest(coalesce(cm.last_read_message_id, 0), v_last_message_id),
         last_receipt_message_id = case
           when v_send_read_receipts
             then greatest(coalesce(cm.last_receipt_message_id, 0), v_last_message_id)
           else cm.last_receipt_message_id
         end
   where cm.conversation_id = p_conversation_id
     and cm.profile_id = auth.uid()
     and (
       coalesce(cm.last_read_message_id, 0) < v_last_message_id
       or (v_send_read_receipts and coalesce(cm.last_receipt_message_id, 0) < v_last_message_id)
     )
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

-- New opaque paths already protect fresh anonymous media. Stop revealing the
-- author UUID in legacy <user-id>/love/... paths until they are migrated.
create or replace function love_private.love_wall_media_object_readable(p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and (
    exists (
      select 1
      from love_private.media_objects m
      join public.love_wall_posts p on p.id = m.post_id
      where m.object_path = p_path
        and ((p.status = 'published' and public.site_feature_enabled('love_wall')) or m.owner_id = auth.uid()
          or public.my_role() in ('admin', 'super_admin'))
    )
    or exists (
      select 1
      from public.love_wall_media lm
      join public.love_wall_posts lp on lp.id = lm.post_id
      where lm.path = p_path
        and (
          (lp.status = 'published' and public.site_feature_enabled('love_wall')
            and not coalesce(lp.is_anonymous, true))
          or lp.author_id = auth.uid()
          or public.my_role() in ('admin', 'super_admin')
        )
    )
  );
$function$;
revoke all on function love_private.love_wall_media_object_readable(text) from public, anon;
grant execute on function love_private.love_wall_media_object_readable(text) to authenticated;

-- The guest Storage policy has its own helper; update it as well so anonymous
-- UUID-bearing legacy objects cannot be listed or signed through that route.
create or replace function guest_api_private.love_wall_media_public_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
      from love_private.media_objects m
      join public.love_wall_posts p on p.id = m.post_id
       where m.object_path = p_path
         and p.status = 'published'
         and public.site_feature_enabled('love_wall')
  ) or exists (
    select 1
      from public.love_wall_media lm
      join public.love_wall_posts lp on lp.id = lm.post_id
     where lm.path = p_path
       and lp.status = 'published'
       and public.site_feature_enabled('love_wall')
       and not coalesce(lp.is_anonymous, true)
  );
$function$;
revoke all on function guest_api_private.love_wall_media_public_readable(text) from public;
grant execute on function guest_api_private.love_wall_media_public_readable(text) to anon, authenticated;

-- Do not expose the raw legacy path through direct table SELECT. The RPC masks
-- UUID-bearing paths for published anonymous posts while preserving media
-- management for authors and administrators.
revoke select on table public.love_wall_media from public, anon, authenticated;
revoke select (id, post_id, path, kind, sort, created_at)
  on table public.love_wall_media from public, anon, authenticated;

create or replace function public.love_wall_media_for_posts(p_post_ids uuid[])
returns table(id uuid, post_id uuid, path text, kind text, sort integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_post_ids is null or cardinality(p_post_ids) > 500 then
    raise exception 'invalid post id list' using errcode = '22023';
  end if;
  return query
    select lm.id,
           lm.post_id,
           case
             when lp.status = 'published'
              and coalesce(lp.is_anonymous, true)
              and lm.path ~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/love/[^/]+$'
              and (
                auth.uid() is null
                or (lp.author_id <> auth.uid()
                  and coalesce(public.my_role(), 'member') not in ('admin', 'super_admin'))
              )
               then null::text
             else lm.path
           end,
           lm.kind,
           lm.sort
      from public.love_wall_media lm
      join public.love_wall_posts lp on lp.id = lm.post_id
     where lm.post_id = any(p_post_ids)
       and (
         (lp.status = 'published' and public.site_feature_enabled('love_wall'))
         or (auth.uid() is not null and lp.author_id = auth.uid())
         or (auth.uid() is not null and public.my_role() in ('admin', 'super_admin'))
       )
     order by lm.sort;
end;
$function$;
revoke all on function public.love_wall_media_for_posts(uuid[]) from public;
grant execute on function public.love_wall_media_for_posts(uuid[]) to anon, authenticated;

create or replace function public.love_wall_media_paths_referenced(p_paths text[])
returns table(path text)
language sql
stable
security definer
set search_path = ''
as $function$
  select distinct lm.path
    from public.love_wall_media lm
    join public.love_wall_posts lp on lp.id = lm.post_id
   where auth.uid() is not null
     and lm.path = any(coalesce(p_paths, array[]::text[]))
     and (lp.author_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));
$function$;
revoke all on function public.love_wall_media_paths_referenced(text[]) from public, anon;
grant execute on function public.love_wall_media_paths_referenced(text[]) to authenticated;

-- Service-role-only finalization RPC used by the dry-run-first migration tool.
-- The object is copied first; this function atomically registers the opaque
-- path and swaps the attachment row, but never exposes service credentials.
create or replace function public.migrate_legacy_love_wall_media_path(
  p_media_id uuid,
  p_old_path text,
  p_new_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_media public.love_wall_media%rowtype;
  v_post public.love_wall_posts%rowtype;
  v_owner_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_media_id is null
     or p_old_path is null
     or p_new_path is null
     or p_old_path !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/love/[^/]+$'
     or p_new_path !~ '^love/[a-f0-9-]{36}[.][a-z0-9]{1,8}$' then
    raise exception 'invalid legacy media path' using errcode = '22023';
  end if;

  v_owner_id := split_part(p_old_path, '/', 1)::uuid;
  select * into v_media
    from public.love_wall_media lm
   where lm.id = p_media_id and lm.path = p_old_path
   for update;
  if not found then
    raise exception 'legacy media row changed' using errcode = '40001';
  end if;
  if (select count(*) from public.love_wall_media lm where lm.path = p_old_path) <> 1 then
    raise exception 'shared legacy path needs manual migration' using errcode = '23505';
  end if;

  select * into v_post from public.love_wall_posts p where p.id = v_media.post_id;
  if not found or v_post.author_id <> v_owner_id or not coalesce(v_post.is_anonymous, true) then
    raise exception 'legacy anonymous media ownership mismatch' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'media' and o.name = p_new_path
  ) then
    raise exception 'copied storage object not found' using errcode = 'P0002';
  end if;

  insert into love_private.media_objects(object_path, owner_id, post_id)
  values (p_new_path, v_owner_id, v_media.post_id)
  on conflict (object_path) do nothing;
  if not exists (
    select 1 from love_private.media_objects m
     where m.object_path = p_new_path
       and m.owner_id = v_owner_id
       and m.post_id = v_media.post_id
  ) then
    raise exception 'opaque media path already belongs to another post' using errcode = '23505';
  end if;

  update public.love_wall_media
     set path = p_new_path
   where id = p_media_id and path = p_old_path;
  if not found then
    raise exception 'legacy media row changed during migration' using errcode = '40001';
  end if;
end;
$function$;
revoke all on function public.migrate_legacy_love_wall_media_path(uuid, text, text) from public, anon, authenticated;
grant execute on function public.migrate_legacy_love_wall_media_path(uuid, text, text) to service_role;

-- A lease token makes retry claims compare-and-swap and prevents an expired
-- request from overwriting the result written by a newer claimant.
alter table public.email_delivery_logs
  add column if not exists claim_token uuid;

commit;
