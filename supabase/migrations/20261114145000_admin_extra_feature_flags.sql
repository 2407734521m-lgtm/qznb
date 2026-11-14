-- Extend the existing admin feature switches without replacing the
-- original permissive policies or their privacy/moderation checks.
-- Missing feature_* settings continue to default to enabled.

begin;

create or replace function public.site_feature_enabled(p_feature text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_feature is null or not (p_feature = any (array[
      'posts', 'comments', 'albums', 'album_photos', 'chat',
      'greetings', 'love_wall', 'songs', 'board_posts',
      'likes', 'media_uploads', 'video_uploads'
    ]::text[])) then false
    else coalesce(
      (select s.value = 'true'
       from public.site_settings as s
       where s.key = ('feature_' || p_feature)
       limit 1),
      true
    )
  end;
$$;

revoke all on function public.site_feature_enabled(text) from public, anon;
grant execute on function public.site_feature_enabled(text) to authenticated, service_role;

-- A restrictive policy is intentional: post_likes has additional permissive
-- moderation policies, which would otherwise OR around a modified l_ins policy.
drop policy if exists site_feature_likes_insert_gate on public.post_likes;
create policy site_feature_likes_insert_gate
  on public.post_likes
  as restrictive
  for insert
  to authenticated
  with check (public.site_feature_enabled('likes'));

-- Apply master switches at the Storage boundary while preserving the existing
-- media_ins/videos_ins checks for ownership, path shape, and moderation.
drop policy if exists site_feature_media_uploads_insert_gate on storage.objects;
create policy site_feature_media_uploads_insert_gate
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (
    bucket_id <> 'media'
    or public.site_feature_enabled('media_uploads')
  );

drop policy if exists site_feature_video_uploads_insert_gate on storage.objects;
create policy site_feature_video_uploads_insert_gate
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (
    bucket_id <> 'videos'
    or public.site_feature_enabled('video_uploads')
  );

commit;
