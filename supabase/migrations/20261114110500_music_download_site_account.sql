-- 音乐下载门禁：下载记录记上本站账号（谁下的）。
-- 已于 2026-11-14 在生产库 ldypnxxxgscibopgiaso 上执行。
-- log_music_download() 改为 9 参（新增 p_site_user_id / p_site_username，带默认值）：
-- 旧的 7 参调用仍可直接跑（默认值补齐），无需保留旧重载。
alter table public.music_download_logs
  add column if not exists site_user_id uuid,
  add column if not exists site_username text;

drop function if exists public.log_music_download(text, text, text, text, bigint, text, text);
create function public.log_music_download(
  p_song_id text, p_song_name text, p_artist text, p_status text,
  p_file_size bigint, p_error text, p_device_label text,
  p_site_user_id uuid default null, p_site_username text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if p_status not in ('success', 'failed', 'unavailable') then
    raise exception 'bad status';
  end if;
  insert into public.music_download_logs(song_id, song_name, artist, status, file_size, error, device_label, site_user_id, site_username)
  values (p_song_id, p_song_name, p_artist, p_status, p_file_size, nullif(p_error, ''), coalesce(p_device_label, ''), p_site_user_id, nullif(p_site_username, ''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.log_music_download(text, text, text, text, bigint, text, text, uuid, text) to anon, authenticated;
