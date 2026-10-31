-- 027: Anonymous song wall publishing and recipient notifications for the confession wall.
-- Public song reads go through a projection that omits author_id. New song uploads
-- publish immediately; administrators retain moderation access through the base table.

alter table public.love_wall_posts
  add column if not exists recipient_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_notified_at timestamptz;
create index if not exists love_wall_posts_recipient_id_idx
  on public.love_wall_posts(recipient_id)
  where recipient_id is not null;

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
     and new.recipient_notified_at is null then
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

-- Only the author and administrators may query the base table directly.
-- The public feed is served through song_wall_published(), which omits author_id.
drop policy if exists song_posts_read on public.song_posts;
create policy song_posts_read on public.song_posts
for select to authenticated
using (author_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));

-- Allow both legacy pending submissions and the new immediate-publish client
-- during rollout. The current client writes status='published'.
drop policy if exists song_posts_insert on public.song_posts;
create policy song_posts_insert on public.song_posts
for insert to authenticated
with check (author_id = auth.uid() and status in ('pending', 'published'));

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
