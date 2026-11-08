-- 20261031160959_admin_feature_flag_uploads.sql
-- Apply feature controls at the Storage boundary for chat media and song audio.
-- Keep upload token creation aligned with the song feature flag.

begin;

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
  and chat_private.is_conversation_member((split_part(name, '/', 1))::bigint)
  and public.site_feature_enabled('chat')
);

drop policy if exists song_audio_insert_own on storage.objects;
create policy song_audio_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'song-audio'
  and exists (
    select 1 from public.song_audio_uploads as u
    where u.path = objects.name
      and u.profile_id = (select auth.uid())
      and u.created_at > (now() - interval '15 minutes')
  )
  and public.site_feature_enabled('songs')
);

create or replace function public.create_song_audio_upload(p_ext text)
returns text
language plpgsql
security definer
set search_path = ''
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

commit;
