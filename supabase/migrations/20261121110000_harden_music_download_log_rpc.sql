-- Close the anonymous write path for music download logs.
-- The radio Worker validates the Supabase access token first and forwards that
-- same user token to this RPC. The database independently binds the log row to
-- auth.uid(), so callers cannot forge another account's identity.

begin;

create or replace function public.log_music_download(
  p_song_id text,
  p_song_name text,
  p_artist text,
  p_status text,
  p_file_size bigint,
  p_error text,
  p_device_label text,
  p_site_user_id uuid default null,
  p_site_username text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id bigint;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_site_user_id is distinct from auth.uid() then
    raise exception 'site user identity mismatch' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('success', 'failed', 'unavailable')
     or p_song_id is null or pg_catalog.char_length(p_song_id) not between 1 and 100
     or pg_catalog.char_length(coalesce(p_song_name, '')) > 200
     or pg_catalog.char_length(coalesce(p_artist, '')) > 200
     or pg_catalog.char_length(coalesce(p_error, '')) > 500
     or pg_catalog.char_length(coalesce(p_device_label, '')) > 80
     or (p_file_size is not null and p_file_size < 0) then
    raise exception 'invalid download log payload' using errcode = '22023';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = auth.uid();

  insert into public.music_download_logs (
    song_id, song_name, artist, status, file_size, error, device_label,
    site_user_id, site_username
  ) values (
    p_song_id,
    coalesce(p_song_name, ''),
    coalesce(p_artist, ''),
    p_status,
    p_file_size,
    nullif(p_error, ''),
    coalesce(p_device_label, ''),
    auth.uid(),
    nullif(v_email, '')
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.log_music_download(text, text, text, text, bigint, text, text, uuid, text)
  from public, anon;
grant execute on function public.log_music_download(text, text, text, text, bigint, text, text, uuid, text)
  to authenticated;

commit;
