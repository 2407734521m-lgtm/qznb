-- Allow an authenticated member to permanently delete only their own confession-wall posts.
-- Related comment and media rows are removed by the existing ON DELETE CASCADE foreign keys.
-- Storage objects use the existing media_del policy, which limits deletion to the uploader's own folder.

begin;

revoke delete on table public.love_wall_posts from public, anon;
grant delete on table public.love_wall_posts to authenticated;

drop policy if exists love_wall_delete_own on public.love_wall_posts;
create policy love_wall_delete_own
on public.love_wall_posts
for delete
to authenticated
using (author_id = (select auth.uid()));

commit;
