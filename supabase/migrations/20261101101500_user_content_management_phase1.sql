-- Phase 1: owner-managed song submissions and comment editing.
-- Existing posts/timelines/albums already have owner update policies; only add
-- the missing permissions required by the new user-facing controls.

begin;

-- Song wall: authenticated authors may remove only their own submission rows.
revoke delete on table public.song_posts from public, anon;
grant delete on table public.song_posts to authenticated;

drop policy if exists song_posts_delete_own on public.song_posts;
create policy song_posts_delete_own
on public.song_posts
for delete
to authenticated
using ((select auth.uid()) = author_id);

-- Published uploads consume their one-time upload token during insert. Permit
-- removal only while the audio path is still attached to the caller's own post.
create policy song_audio_delete_own_submission
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'song-audio'
  and exists (
    select 1
    from public.song_posts s
    where s.audio_path = objects.name
      and s.author_id = (select auth.uid())
  )
);

-- Comment editing is limited to the body column and to the original author.
-- Do not let a client rewrite author_id, post_id or moderation timestamps.
revoke update on table public.comments from public, anon, authenticated;
grant update (content) on table public.comments to authenticated;

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
on public.comments
for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

commit;
