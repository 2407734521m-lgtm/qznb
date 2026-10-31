-- 024: Restrict private video object reads to owners, admins, and approved member videos.
-- The bucket is private, but Storage SELECT policies are the actual object-level boundary.

drop policy if exists videos_sel on storage.objects;

create policy videos_sel
on storage.objects
for select
to authenticated
using (
  bucket_id = 'videos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.my_role()) in ('admin', 'super_admin')
    or (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1
        from public.member_video(((storage.foldername(name))[1])::uuid) as mv
        where mv.path = name
          and mv.status = 'approved'
      )
    )
  )
);
