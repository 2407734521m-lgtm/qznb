-- 音乐下载记录：供「千栀音乐下载」下载页 / App 记下载成功、失败、下不了。
-- 已于 2026-11-14 在生产库 ldypnxxxgscibopgiaso 上执行（apply_migration music_download_logs）。
-- 写入只走 SECURITY DEFINER 的 log_music_download()（anon/authenticated 可调），
-- 表本身不对 anon 开放；读取只允许 admin / super_admin。
create table if not exists public.music_download_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  song_id text not null,
  song_name text not null default '',
  artist text not null default '',
  status text not null check (status in ('success', 'failed', 'unavailable')),
  file_size bigint,
  error text,
  device_label text not null default ''
);
alter table public.music_download_logs enable row level security;
drop policy if exists mdl_sel_admin on public.music_download_logs;
create policy mdl_sel_admin on public.music_download_logs
  for select to authenticated
  using (my_role() = any (array['admin', 'super_admin']));
create or replace function public.log_music_download(
  p_song_id text, p_song_name text, p_artist text, p_status text,
  p_file_size bigint, p_error text, p_device_label text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if p_status not in ('success', 'failed', 'unavailable') then
    raise exception 'bad status';
  end if;
  insert into public.music_download_logs(song_id, song_name, artist, status, file_size, error, device_label)
  values (p_song_id, p_song_name, p_artist, p_status, p_file_size, nullif(p_error, ''), coalesce(p_device_label, ''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.log_music_download(text, text, text, text, bigint, text, text) to anon, authenticated;
