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

-- Preserve the upload registry until the matching Storage object is removed.
-- An author can then remove only their own upload-registration row.
revoke delete on table public.song_audio_uploads from public, anon;
grant delete on table public.song_audio_uploads to authenticated;

drop policy if exists song_audio_uploads_delete_own on public.song_audio_uploads;
create policy song_audio_uploads_delete_own
on public.song_audio_uploads
for delete
to authenticated
using ((select auth.uid()) = profile_id);

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
