-- Phase 2: allow a member to edit only the content of their own wish.
-- Albums and timelines already have owner UPDATE policies in the live Project B.

begin;

revoke update on table public.wishes from public, anon, authenticated;
revoke update (id, author_id, content, likes, created_at)
  on table public.wishes from public, anon, authenticated;
grant update (content) on table public.wishes to authenticated;

drop policy if exists wishes_update_own on public.wishes;
create policy wishes_update_own
on public.wishes
for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

commit;
