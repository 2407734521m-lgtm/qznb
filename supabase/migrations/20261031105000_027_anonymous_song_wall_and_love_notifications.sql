-- 027: Anonymous song wall publishing and recipient notifications for the confession wall.

alter table public.love_wall_posts
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_notified_at timestamptz;

create index if not exists love_wall_posts_recipient_id_idx
  on public.love_wall_posts(recipient_id)
  where recipient_id is not null;

drop policy if exists love_wall_insert on public.love_wall_posts;
create policy love_wall_insert on public.love_wall_posts
for insert to authenticated
with check (
  author_id = auth.uid()
  and status = 'pending'
  and recipient_notified_at is null
);

create or replace function public.notify_love_wall_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'published'
     and new.recipient_id is not null
     and new.recipient_id <> new.author_id
     and new.recipient_notified_at is null
     and exists (
       select 1 from public.profiles r
       where r.id = new.recipient_id and r.joined
     ) then
    insert into public.notifications(profile_id, type, title, body, link)
    values (
      new.recipient_id,
      'love_wall',
      '你收到一份匿名心意',
      '有人给你写了一份匿名心意，打开表白墙查看。',
      '/love-wall'
    );

    update public.love_wall_posts
    set recipient_notified_at = now()
    where id = new.id and recipient_notified_at is null;
  end if;
  return new;
end;
$function$;

revoke all on function public.notify_love_wall_recipient() from public, anon, authenticated, service_role;
drop trigger if exists love_wall_notify_recipient on public.love_wall_posts;
create trigger love_wall_notify_recipient
after insert or update on public.love_wall_posts
for each row execute function public.notify_love_wall_recipient();

-- Public users can query only a projection of published songs, never author_id.
drop policy if exists song_posts_read on public.song_posts;
create policy song_posts_read on public.song_posts
for select to authenticated
using (author_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));

-- Opaque random audio paths prevent public storage paths from exposing profile IDs.
alter table public.song_posts drop constraint if exists song_audio_path_owner;
alter table public.song_posts
  add constraint song_audio_path_opaque check (
    audio_path like 'songs/%'
    and length(audio_path) between 44 and 53
    and substring(audio_path from 7 for 36) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    and substring(audio_path from 43 for 1) = '.'
    and substring(audio_path from 44) !~ '[^a-z0-9]'
  );

-- A private upload-intent row binds an opaque path to the authenticated uploader.
create table if not exists public.song_audio_uploads (
  path text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.song_audio_uploads enable row level security;
revoke all on table public.song_audio_uploads from public, anon, authenticated;
grant select on table public.song_audio_uploads to authenticated;
create index if not exists song_audio_uploads_profile_created_idx
  on public.song_audio_uploads(profile_id, created_at);
drop policy if exists song_audio_uploads_read_own on public.song_audio_uploads;
create policy song_audio_uploads_read_own on public.song_audio_uploads
for select to authenticated using (profile_id = auth.uid());

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
  if p_ext is null or char_length(p_ext) < 1 or char_length(p_ext) > 10 or p_ext ~ '[^a-z0-9]' then
    raise exception 'invalid audio extension' using errcode = '22023';
  end if;

  -- Serialize token creation per member and cap abandoned uploads.
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
revoke all on function public.create_song_audio_upload(text) from public, anon;
grant execute on function public.create_song_audio_upload(text) to authenticated;

create or replace function public.consume_song_audio_upload_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted integer;
begin
  delete from public.song_audio_uploads
  where path = new.audio_path
    and profile_id = new.author_id
    and created_at > now() - interval '15 minutes';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'audio upload token is invalid or expired' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.consume_song_audio_upload_token() from public, anon, authenticated, service_role;
drop trigger if exists song_posts_consume_upload_token on public.song_posts;
create trigger song_posts_consume_upload_token
after insert on public.song_posts
for each row execute function public.consume_song_audio_upload_token();

-- Uploads must have a fresh path token belonging to the current user.
drop policy if exists song_audio_insert_own on storage.objects;
create policy song_audio_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'song-audio'
  and exists (
    select 1 from public.song_audio_uploads u
    where u.path = name
      and u.profile_id = auth.uid()
      and u.created_at > now() - interval '15 minutes'
  )
);

-- Let the owner clean up an unfinished upload; published audio is retained for moderation.
drop policy if exists song_audio_delete_own_pending on storage.objects;
create policy song_audio_delete_own_pending on storage.objects
for delete to authenticated
using (
  bucket_id = 'song-audio'
  and (
    exists (
      select 1 from public.song_audio_uploads u
      where u.path = name and u.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.song_posts s
      where s.audio_path = name and s.author_id = auth.uid() and s.status = 'pending'
    )
  )
);

drop policy if exists song_posts_insert on public.song_posts;
create policy song_posts_insert on public.song_posts
for insert to authenticated
with check (
  author_id = auth.uid()
  and status in ('pending', 'published')
  and exists (
    select 1 from public.song_audio_uploads u
    where u.path = audio_path
      and u.profile_id = auth.uid()
      and u.created_at > now() - interval '15 minutes'
  )
);

create or replace function public.song_wall_audio_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
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
revoke all on function public.song_wall_audio_readable(text) from public;
grant execute on function public.song_wall_audio_readable(text) to authenticated;

drop policy if exists song_audio_read_allowed on storage.objects;
create policy song_audio_read_allowed on storage.objects
for select to authenticated
using (bucket_id = 'song-audio' and public.song_wall_audio_readable(name));

create or replace function public.song_wall_published()
returns table (
  id uuid,
  title text,
  description text,
  audio_path text,
  duration_seconds integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.id, s.title, s.description, s.audio_path, s.duration_seconds, s.created_at
  from public.song_posts s
  where auth.uid() is not null
    and s.status = 'published'
  order by s.created_at desc
  limit 100;
$function$;
revoke all on function public.song_wall_published() from public;
grant execute on function public.song_wall_published() to authenticated;
