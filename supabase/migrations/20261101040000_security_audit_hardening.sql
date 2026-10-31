-- Round-two security hardening: event roster visibility and Storage MIME allowlists.
begin;

-- Event registrations are a member-facing roster, not a public directory.
-- Keep the roster visible to joined members and administrators only.
drop policy if exists er_sel on public.event_regs;
create policy er_sel
on public.event_regs
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or public.is_member()
  or public.my_role() in ('admin', 'super_admin')
);

-- Enforce file types at the Storage service boundary, not only in browser inputs.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'avatars';

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v', 'video/3gpp'
]::text[]
where id = 'media';

update storage.buckets
set allowed_mime_types = array[
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v', 'video/3gpp'
]::text[]
where id = 'videos';

commit;
