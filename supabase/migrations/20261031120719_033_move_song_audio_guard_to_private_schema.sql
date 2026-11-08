-- 033: Keep the song-audio authorization helper out of the exposed API schema.
-- The helper is only used by the Storage RLS policy, not by the frontend RPC API.

create schema if not exists song_private;
revoke all on schema song_private from public, anon;
grant usage on schema song_private to authenticated;

create or replace function song_private.song_wall_audio_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.song_posts s
    where s.audio_path = p_path
      and (
        s.status = 'published'
        or s.author_id = auth.uid()
        or public.my_role() in ('admin', 'super_admin')
      )
  );
$function$;

revoke all on function song_private.song_wall_audio_readable(text) from public, anon;
grant execute on function song_private.song_wall_audio_readable(text) to authenticated;

drop policy if exists song_audio_read_allowed on storage.objects;
create policy song_audio_read_allowed on storage.objects
for select to authenticated
using (
  bucket_id = 'song-audio'
  and song_private.song_wall_audio_readable(name)
);

drop function public.song_wall_audio_readable(text);
