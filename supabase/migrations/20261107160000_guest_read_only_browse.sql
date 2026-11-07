-- Guest browse mode: expose only published confession text and aggregate counts.
-- Guest nicknames remain browser-local; no guest profile or auth.users row is created.

create or replace function public.love_wall_guest_published()
returns table (
  id uuid,
  recipient_name text,
  category text,
  content text,
  is_anonymous boolean,
  created_at timestamptz,
  comment_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id,
    p.recipient_name,
    p.category,
    p.content,
    p.is_anonymous,
    p.created_at,
    count(c.id)::bigint as comment_count
  from public.love_wall_posts p
  left join public.love_wall_comments c
    on c.post_id = p.id
   and c.deleted_at is null
  where p.status = 'published'
  group by p.id
  order by p.created_at desc
  limit 100;
$function$;

revoke all on function public.love_wall_guest_published() from public, anon, authenticated;
grant execute on function public.love_wall_guest_published() to anon, authenticated;

-- The path is disclosed only when it is linked to a published post.
-- This helper intentionally does not return author IDs or comment content.
create or replace function public.love_wall_media_public_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.love_wall_media m
    join public.love_wall_posts p on p.id = m.post_id
    where m.path = p_path
      and p.status = 'published'
  );
$function$;

revoke all on function public.love_wall_media_public_readable(text) from public, anon, authenticated;
grant execute on function public.love_wall_media_public_readable(text) to anon, authenticated;

grant select (id, post_id, path, kind, sort) on public.love_wall_media to anon;

drop policy if exists love_wall_media_public_guest_read on public.love_wall_media;
create policy love_wall_media_public_guest_read
  on public.love_wall_media
  for select
  to anon
  using (public.love_wall_media_public_readable(path));

-- Allow signing/reading only attachment objects explicitly linked to published posts.
-- All other media objects remain protected by their existing policies.
drop policy if exists love_wall_media_public_guest_object_read on storage.objects;
create policy love_wall_media_public_guest_object_read
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'media'
    and public.love_wall_media_public_readable(name)
  );
