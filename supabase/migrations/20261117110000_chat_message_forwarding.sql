-- Safe message forwarding across direct and group conversations.
-- Media objects are copied into the destination conversation's private folder;
-- the database validates membership, source ownership, destination paths and metadata.
begin;

alter table public.messages
  add column if not exists forwarded_from_message_id bigint,
  add column if not exists forwarded_from_sender_id uuid,
  add column if not exists forwarded_from_name text;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_forwarded_from_message_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_forwarded_from_message_id_fkey
      foreign key (forwarded_from_message_id)
      references public.messages(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_forwarded_from_sender_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_forwarded_from_sender_id_fkey
      foreign key (forwarded_from_sender_id)
      references public.profiles(id)
      on delete set null;
  end if;
end;
$constraints$;

comment on column public.messages.forwarded_from_message_id is
  'Original message id for a forwarded copy; NULL for ordinary messages.';
comment on column public.messages.forwarded_from_sender_id is
  'Original author id snapshot for a forwarded copy; NULL for ordinary messages.';
comment on column public.messages.forwarded_from_name is
  'Privacy-aware original author name snapshot displayed on a forwarded copy.';

create or replace function public.forward_chat_message(
  p_source_message_id bigint,
  p_target_conversation_id bigint,
  p_forwarded_media_body text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source public.messages%rowtype;
  v_source_content text;
  v_effect_kind text;
  v_effect_prefix text := '';
  v_forwarded_body text;
  v_source_inner text;
  v_new_inner text;
  v_source_path text;
  v_new_path text;
  v_source_poster text;
  v_new_poster text;
  v_source_filename text;
  v_new_filename text;
  v_source_size text;
  v_new_size text;
  v_origin_sender_id uuid;
  v_origin_name text;
  v_username text;
  v_display_name text;
  v_show_name boolean := false;
  v_message_id bigint;
begin
  if auth.uid() is null
     or not public.is_member()
     or p_source_message_id is null
     or p_target_conversation_id is null then
    raise exception 'invalid forwarding request' using errcode = '42501';
  end if;

  if not public.site_feature_enabled('chat') then
    raise exception 'chat is currently unavailable';
  end if;

  select m.*
    into v_source
    from public.messages m
   where m.id = p_source_message_id
   for share;

  if not found
     or v_source.deleted_at is not null
     or (v_source.expires_at is not null and v_source.expires_at <= pg_catalog.now())
     or not chat_private.is_conversation_member(v_source.conversation_id)
     or not chat_private.is_conversation_member(p_target_conversation_id) then
    raise exception 'source or destination conversation is unavailable'
      using errcode = '42501';
  end if;

  -- Retain ordinary bubble effects such as Invisible Ink, but do not replay
  -- a sender-triggered full-screen animation when the copied message arrives.
  v_effect_kind := pg_catalog.substring(
    v_source.body
    from '^\[\[im-bubble-effect:(slam|loud|gentle|invisible-ink|screen-(echo|spotlight|balloons|confetti|love|lasers|fireworks|celebration))\]\]'
  );

  if v_effect_kind is not null then
    v_source_content := pg_catalog.regexp_replace(
      v_source.body,
      '^\[\[im-bubble-effect:(slam|loud|gentle|invisible-ink|screen-(echo|spotlight|balloons|confetti|love|lasers|fireworks|celebration))\]\]',
      ''
    );
    if v_effect_kind not like 'screen-%' then
      v_effect_prefix := '[[im-bubble-effect:' || v_effect_kind || ']]';
    end if;
  else
    v_source_content := v_source.body;
  end if;

  -- Text is copied from the source row, never accepted from the browser.
  -- Attachments require a freshly uploaded object in the target member's folder.
  if pg_catalog.left(v_source_content, 11) = '[[im-image:' then
    if pg_catalog.right(v_source_content, 2) <> ']]'
       or p_forwarded_media_body is null
       or pg_catalog.left(p_forwarded_media_body, 11) <> '[[im-image:'
       or pg_catalog.right(p_forwarded_media_body, 2) <> ']]' then
      raise exception 'invalid forwarded image';
    end if;

    v_source_path := pg_catalog.substring(v_source_content from 12 for pg_catalog.char_length(v_source_content) - 13);
    v_new_path := pg_catalog.substring(p_forwarded_media_body from 12 for pg_catalog.char_length(p_forwarded_media_body) - 13);

    if v_source_path !~ ('^' || v_source.conversation_id::text || '/[^/]+/[^/]+$')
       or pg_catalog.strpos(v_source_path, '..') > 0
       or v_new_path !~ ('^' || p_target_conversation_id::text || '/' || auth.uid()::text || '/[^/]+$')
       or pg_catalog.strpos(v_new_path, '..') > 0
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'chat-media' and o.name = v_new_path
       ) then
      raise exception 'forwarded image is not stored in the destination conversation'
        using errcode = '42501';
    end if;
    v_forwarded_body := v_effect_prefix || p_forwarded_media_body;

  elsif pg_catalog.left(v_source_content, 11) = '[[im-audio:' then
    if pg_catalog.right(v_source_content, 2) <> ']]'
       or p_forwarded_media_body is null
       or pg_catalog.left(p_forwarded_media_body, 11) <> '[[im-audio:'
       or pg_catalog.right(p_forwarded_media_body, 2) <> ']]' then
      raise exception 'invalid forwarded audio';
    end if;

    v_source_path := pg_catalog.substring(v_source_content from 12 for pg_catalog.char_length(v_source_content) - 13);
    v_new_path := pg_catalog.substring(p_forwarded_media_body from 12 for pg_catalog.char_length(p_forwarded_media_body) - 13);

    if v_source_path !~ ('^' || v_source.conversation_id::text || '/[^/]+/[^/]+$')
       or pg_catalog.strpos(v_source_path, '..') > 0
       or v_new_path !~ ('^' || p_target_conversation_id::text || '/' || auth.uid()::text || '/[^/]+$')
       or pg_catalog.strpos(v_new_path, '..') > 0
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'chat-media' and o.name = v_new_path
       ) then
      raise exception 'forwarded audio is not stored in the destination conversation'
        using errcode = '42501';
    end if;
    v_forwarded_body := v_effect_prefix || p_forwarded_media_body;

  elsif pg_catalog.left(v_source_content, 11) = '[[im-video:' then
    if pg_catalog.right(v_source_content, 2) <> ']]'
       or p_forwarded_media_body is null
       or pg_catalog.left(p_forwarded_media_body, 11) <> '[[im-video:'
       or pg_catalog.right(p_forwarded_media_body, 2) <> ']]' then
      raise exception 'invalid forwarded video';
    end if;

    v_source_inner := pg_catalog.substring(v_source_content from 12 for pg_catalog.char_length(v_source_content) - 13);
    v_new_inner := pg_catalog.substring(p_forwarded_media_body from 12 for pg_catalog.char_length(p_forwarded_media_body) - 13);
    v_source_path := pg_catalog.split_part(v_source_inner, '|', 1);
    v_source_poster := nullif(pg_catalog.split_part(v_source_inner, '|', 2), '');
    v_new_path := pg_catalog.split_part(v_new_inner, '|', 1);
    v_new_poster := nullif(pg_catalog.split_part(v_new_inner, '|', 2), '');

    if v_source_inner <> v_source_path || case when v_source_poster is not null then '|' || v_source_poster else '' end
       or v_new_inner <> v_new_path || case when v_new_poster is not null then '|' || v_new_poster else '' end
       or (v_source_poster is null and v_new_poster is not null)
       or (v_source_poster is not null and v_new_poster is null)
       or v_source_path !~ ('^' || v_source.conversation_id::text || '/[^/]+/[^/]+$')
       or pg_catalog.strpos(v_source_path, '..') > 0
       or v_new_path !~ ('^' || p_target_conversation_id::text || '/' || auth.uid()::text || '/[^/]+$')
       or pg_catalog.strpos(v_new_path, '..') > 0
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'chat-media' and o.name = v_new_path
       )
       or (
         v_source_poster is not null
         and (
           v_source_poster !~ ('^' || v_source.conversation_id::text || '/[^/]+/[^/]+$')
           or pg_catalog.strpos(v_source_poster, '..') > 0
           or v_new_poster !~ ('^' || p_target_conversation_id::text || '/' || auth.uid()::text || '/[^/]+$')
           or pg_catalog.strpos(v_new_poster, '..') > 0
           or not exists (
             select 1 from storage.objects o
             where o.bucket_id = 'chat-media' and o.name = v_new_poster
           )
         )
       ) then
      raise exception 'forwarded video or cover is not stored in the destination conversation'
        using errcode = '42501';
    end if;
    v_forwarded_body := v_effect_prefix || p_forwarded_media_body;

  elsif pg_catalog.left(v_source_content, 10) = '[[im-file:' then
    if pg_catalog.right(v_source_content, 2) <> ']]'
       or p_forwarded_media_body is null
       or pg_catalog.left(p_forwarded_media_body, 10) <> '[[im-file:'
       or pg_catalog.right(p_forwarded_media_body, 2) <> ']]' then
      raise exception 'invalid forwarded file';
    end if;

    v_source_inner := pg_catalog.substring(v_source_content from 11 for pg_catalog.char_length(v_source_content) - 12);
    v_new_inner := pg_catalog.substring(p_forwarded_media_body from 11 for pg_catalog.char_length(p_forwarded_media_body) - 12);
    v_source_path := pg_catalog.split_part(v_source_inner, '|', 1);
    v_source_filename := pg_catalog.split_part(v_source_inner, '|', 2);
    v_source_size := pg_catalog.split_part(v_source_inner, '|', 3);
    v_new_path := pg_catalog.split_part(v_new_inner, '|', 1);
    v_new_filename := pg_catalog.split_part(v_new_inner, '|', 2);
    v_new_size := pg_catalog.split_part(v_new_inner, '|', 3);

    if v_source_inner <> v_source_path || '|' || v_source_filename || '|' || v_source_size
       or v_new_inner <> v_new_path || '|' || v_new_filename || '|' || v_new_size
       or v_source_filename = ''
       or v_source_size !~ '^[0-9]+$'
       or v_new_filename <> v_source_filename
       or v_new_size <> v_source_size
       or v_source_path !~ ('^' || v_source.conversation_id::text || '/[^/]+/[^/]+$')
       or pg_catalog.strpos(v_source_path, '..') > 0
       or v_new_path !~ ('^' || p_target_conversation_id::text || '/' || auth.uid()::text || '/[^/]+$')
       or pg_catalog.strpos(v_new_path, '..') > 0
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'chat-media' and o.name = v_new_path
       ) then
      raise exception 'forwarded file is not stored in the destination conversation'
        using errcode = '42501';
    end if;
    v_forwarded_body := v_effect_prefix || p_forwarded_media_body;

  else
    if p_forwarded_media_body is not null then
      raise exception 'text forwarding does not accept replacement media content';
    end if;
    v_forwarded_body := v_effect_prefix || v_source_content;
  end if;

  -- Preserve the first/original author when a forwarded copy is forwarded again.
  v_origin_sender_id := coalesce(v_source.forwarded_from_sender_id, v_source.sender_id);
  v_origin_name := nullif(pg_catalog.btrim(v_source.forwarded_from_name), '');

  if v_origin_name is null then
    select p.username::text,
           p.display_name,
           coalesce(privacy.show_name, false)
      into v_username, v_display_name, v_show_name
      from public.profiles p
      left join public.profile_privacy privacy on privacy.profile_id = p.id
     where p.id = v_source.sender_id;

    v_origin_name := coalesce(
      case when v_show_name then nullif(pg_catalog.btrim(v_display_name), '') else null end,
      nullif(pg_catalog.btrim(v_username), ''),
      '已注销用户'
    );
    v_origin_sender_id := v_source.sender_id;
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    body,
    forwarded_from_message_id,
    forwarded_from_sender_id,
    forwarded_from_name
  )
  values (
    p_target_conversation_id,
    auth.uid(),
    v_forwarded_body,
    coalesce(v_source.forwarded_from_message_id, v_source.id),
    v_origin_sender_id,
    pg_catalog.left(v_origin_name, 80)
  )
  returning id into v_message_id;

  return v_message_id;
end;
$function$;

revoke all on function public.forward_chat_message(bigint, bigint, text) from public, anon;
grant execute on function public.forward_chat_message(bigint, bigint, text) to authenticated;

commit;
