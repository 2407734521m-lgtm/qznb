-- 028: Restrict anonymous song wall helper RPCs to authenticated members only.
revoke all on function public.song_wall_published() from public, anon, service_role;
grant execute on function public.song_wall_published() to authenticated;

revoke all on function public.song_wall_audio_readable(text) from public, anon, service_role;
grant execute on function public.song_wall_audio_readable(text) to authenticated;

revoke all on function public.create_song_audio_upload(text) from public, anon, service_role;
grant execute on function public.create_song_audio_upload(text) to authenticated;
