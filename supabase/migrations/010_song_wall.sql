-- 010_song_wall.sql
-- New schema only; do not run automatically. Uploads are private and only published song paths can be read by other members.
create table if not exists public.song_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  audio_path text not null unique,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 600),
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint song_audio_path_owner check (split_part(audio_path, '/', 1) = author_id::text)
);
create index if not exists song_posts_status_created_idx on public.song_posts(status, created_at desc);
create index if not exists song_posts_author_created_idx on public.song_posts(author_id, created_at desc);
alter table public.song_posts enable row level security;
drop policy if exists song_posts_read on public.song_posts;
create policy song_posts_read on public.song_posts for select to authenticated
using (status = 'published' or author_id = auth.uid() or public.my_role() in ('admin','super_admin'));
drop policy if exists song_posts_insert on public.song_posts;
create policy song_posts_insert on public.song_posts for insert to authenticated
with check (author_id = auth.uid() and status = 'pending');
drop policy if exists song_posts_admin_update on public.song_posts;
create policy song_posts_admin_update on public.song_posts for update to authenticated
using (public.my_role() in ('admin','super_admin'))
with check (public.my_role() in ('admin','super_admin'));
grant select, insert on public.song_posts to authenticated;
grant update on public.song_posts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('song-audio', 'song-audio', false, 20971520, array['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/webm','audio/x-wav','audio/flac'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = array['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/webm','audio/x-wav','audio/flac'];
drop policy if exists song_audio_insert_own on storage.objects;
create policy song_audio_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'song-audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists song_audio_read_allowed on storage.objects;
create policy song_audio_read_allowed on storage.objects for select to authenticated
using (
  bucket_id = 'song-audio' and exists (
    select 1 from public.song_posts s
    where s.audio_path = name
      and (s.status = 'published' or s.author_id = auth.uid() or public.my_role() in ('admin','super_admin'))
  )
);
drop policy if exists song_audio_delete_own_pending on storage.objects;
create policy song_audio_delete_own_pending on storage.objects for delete to authenticated
using (
  bucket_id = 'song-audio' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.song_posts s where s.audio_path = name and s.author_id = auth.uid() and s.status = 'pending')
);

-- No data is deleted by this migration. Review and execute separately before enabling the feature.
