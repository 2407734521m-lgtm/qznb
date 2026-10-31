-- 029: Bind feedback attribution to the authenticated session.
-- Anonymous feedback remains supported, but anonymous callers cannot assign
-- submissions to another member's profile ID.

drop policy if exists fb_ins on public.feedbacks;

create policy fb_ins on public.feedbacks
for insert to anon, authenticated
with check (
  user_id is not distinct from (select auth.uid())
);
