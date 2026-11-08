-- Public, read-only access to ordinary community posts for unauthenticated visitors.
-- This deliberately excludes private conversations, drafts, and non-community sections.
-- Names respect each author's existing profile visibility preference.

create or replace function guest_api_private.guest_public_posts(
  p_section text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id bigint,
  author_name text,
  content text,
  image_url text,
  created_at timestamptz,
  section text,
  like_count bigint,
  comment_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p.id,
    case
      when coalesce(pp.show_name, true) then
        coalesce(nullif(pg_catalog.btrim(pr.display_name), ''), pr.username::text, '用户')
      else '匿名用户'
    end as author_name,
    p.content,
    p.image_url,
    p.created_at,
    p.section,
    (
      select count(*)::bigint
      from public.post_likes pl
      where pl.post_id = p.id
    ) as like_count,
    (
      select count(*)::bigint
      from public.comments c
      where c.post_id = p.id
        and c.deleted_at is null
    ) as comment_count
  from public.posts p
  left join public.profiles pr on pr.id = p.author_id
  left join public.profile_privacy pp on pp.profile_id = p.author_id
  where guest_api_private.guest_browse_available()
    and p.deleted_at is null
    and p.section = any (array['feed', 'daily']::text[])
    and (
      p_section = 'all'
      or p_section = p.section
    )
    and p_section = any (array['all', 'feed', 'daily']::text[])
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function guest_api_private.guest_public_posts(text, integer, integer) from public, anon, authenticated;
grant execute on function guest_api_private.guest_public_posts(text, integer, integer) to anon, authenticated;

-- Expose only the narrow feed RPC in the public Data API; the underlying table
-- remains member-only and all write operations continue to require membership.
create or replace function public.guest_public_posts(
  p_section text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id bigint,
  author_name text,
  content text,
  image_url text,
  created_at timestamptz,
  section text,
  like_count bigint,
  comment_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select *
  from guest_api_private.guest_public_posts(p_section, p_limit, p_offset);
$function$;

revoke all on function public.guest_public_posts(text, integer, integer) from public, anon, authenticated;
grant execute on function public.guest_public_posts(text, integer, integer) to anon, authenticated;

-- A visitor can sign/read an image only when its exact storage path is referenced
-- by a non-deleted feed or daily post. No folder listing or general media access.
create or replace function guest_api_private.guest_post_image_public_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select guest_api_private.guest_browse_available()
    and exists (
      select 1
      from public.posts p
      where p.image_url = p_path
        and p.deleted_at is null
        and p.section = any (array['feed', 'daily']::text[])
    );
$function$;

revoke all on function guest_api_private.guest_post_image_public_readable(text) from public, anon, authenticated;
grant execute on function guest_api_private.guest_post_image_public_readable(text) to anon, authenticated;

drop policy if exists guest_public_post_image_read on storage.objects;
create policy guest_public_post_image_read
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'media'
    and guest_api_private.guest_post_image_public_readable(name)
  );

create index if not exists posts_guest_public_feed_idx
  on public.posts (section, created_at desc, id desc)
  where deleted_at is null;
