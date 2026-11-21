-- 20261121102000_harden_music_download_log_identity.sql
-- The download log RPC is callable by anon for guest download telemetry.
-- Never trust identity fields supplied by that public client: bind identity to
-- the verified Supabase JWT (auth.uid()) and resolve the username server-side.
-- Keep the nine-argument signature for existing clients; the last two inputs
-- are retained for compatibility but are intentionally ignored.

begin;

create or replace function public.log_music_download(
  p_song_id text,
  p_song_name text,
  p_artist text,
  p_status text,
  p_file_size bigint,
  p_error text,
  p_device_label text,
  p_site_user_id uuid default null::uuid,
  p_site_username text default null::text
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint;
  v_actor uuid := auth.uid();
  v_username text;
  v_song_id text := pg_catalog.btrim(coalesce(p_song_id, ''));
  v_song_name text := pg_catalog.btrim(coalesce(p_song_name, ''));
  v_artist text := pg_catalog.btrim(coalesce(p_artist, ''));
  v_error text := pg_catalog.btrim(coalesce(p_error, ''));
  v_device_label text := pg_catalog.btrim(coalesce(p_device_label, ''));
begin
  if p_status is null
     or p_status not in ('success', 'failed', 'unavailable') then
    raise exception 'bad status' using errcode = '22023';
  end if;

  if pg_catalog.char_length(v_song_id) not between 1 and 180
     or pg_catalog.char_length(v_song_name) > 240
     or pg_catalog.char_length(v_artist) > 180
     or pg_catalog.char_length(v_error) > 1500
     or pg_catalog.char_length(v_device_label) > 120
     or (p_file_size is not null and (p_file_size < 0 or p_file_size > 21474836480)) then
    raise exception 'invalid music download log fields' using errcode = '22023';
  end if;

  if v_actor is not null then
    select p.username::text
      into v_username
      from public.profiles p
     where p.id = v_actor;
  end if;

  insert into public.music_download_logs(
    song_id,
    song_name,
    artist,
    status,
    file_size,
    error,
    device_label,
    site_user_id,
    site_username
  )
  values (
    v_song_id,
    v_song_name,
    v_artist,
    p_status,
    p_file_size,
    nullif(v_error, ''),
    v_device_label,
    v_actor,
    v_username
  )
  returning id into v_id;

  return v_id;
end;
$function$;

commit;
