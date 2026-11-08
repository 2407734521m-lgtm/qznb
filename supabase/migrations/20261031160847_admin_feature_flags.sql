-- 20261031160847_admin_feature_flags.sql
-- Super-admin feature switches enforced at the database write boundary.
-- Missing feature_* settings default to enabled to preserve existing behavior.
-- Existing rows remain readable; this migration only gates new submissions.

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
      'greetings', 'love_wall', 'songs', 'board_posts'
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

drop policy if exists p_ins on public.posts;
create policy p_ins on public.posts for insert to authenticated
with check (public.is_member() and author_id = (select auth.uid()) and public.site_feature_enabled('posts'));

drop policy if exists c_ins on public.comments;
create policy c_ins on public.comments for insert to authenticated
with check (public.is_member() and author_id = (select auth.uid()) and public.site_feature_enabled('comments'));

drop policy if exists ab_ins on public.albums;
create policy ab_ins on public.albums for insert to authenticated
with check (public.is_member() and created_by = (select auth.uid()) and public.site_feature_enabled('albums'));

drop policy if exists ap_ins on public.album_photos;
create policy ap_ins on public.album_photos for insert to authenticated
with check (public.is_member() and uploaded_by = (select auth.uid()) and public.site_feature_enabled('album_photos'));

drop policy if exists m_ins on public.messages;
create policy m_ins on public.messages for insert to authenticated
with check (sender_id = (select auth.uid()) and chat_private.is_conversation_member(conversation_id) and public.site_feature_enabled('chat'));

drop policy if exists g_ins on public.greetings;
create policy g_ins on public.greetings for insert to authenticated
with check (author_id = (select auth.uid()) and public.site_feature_enabled('greetings'));

drop policy if exists love_wall_insert on public.love_wall_posts;
create policy love_wall_insert on public.love_wall_posts for insert to authenticated
with check (author_id = (select auth.uid()) and status = 'pending' and recipient_notified_at is null and public.site_feature_enabled('love_wall'));

drop policy if exists love_wall_comments_insert on public.love_wall_comments;
create policy love_wall_comments_insert on public.love_wall_comments for insert to authenticated
with check (
  author_id = (select auth.uid()) and public.is_member()
  and exists (select 1 from public.love_wall_posts as p where p.id = love_wall_comments.post_id and p.status = 'published')
  and public.site_feature_enabled('love_wall')
);

drop policy if exists love_wall_media_insert on public.love_wall_media;
create policy love_wall_media_insert on public.love_wall_media for insert to authenticated
with check (
  exists (select 1 from public.love_wall_posts as p where p.id = love_wall_media.post_id and p.author_id = (select auth.uid()))
  and public.site_feature_enabled('love_wall')
);

drop policy if exists song_posts_insert on public.song_posts;
create policy song_posts_insert on public.song_posts for insert to authenticated
with check (
  author_id = (select auth.uid()) and status = any (array['pending','published']::text[])
  and exists (
    select 1 from public.song_audio_uploads as u
    where u.path = song_posts.audio_path and u.profile_id = (select auth.uid())
      and u.created_at > (now() - interval '15 minutes')
  )
  and public.site_feature_enabled('songs')
);

drop policy if exists bm_ins on public.board_messages;
create policy bm_ins on public.board_messages for insert to authenticated
with check (
  public.is_member() and author_id = (select auth.uid())
  and (
    (is_admin_msg = false and public.site_feature_enabled('board_posts'))
    or (is_admin_msg = true and public.my_role() = any (array['admin','super_admin']::text[]))
  )
);

commit;
