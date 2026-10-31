-- 20261031161311_admin_media_feature_flags.sql
-- Gate the shared media bucket by path: album photos use the member root;
-- Love Wall attachments use the member/love/ directory.
-- Keep the two feature switches independent.

begin;

drop policy if exists media_ins on storage.objects;
create policy media_ins on storage.objects
for insert to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = ((select auth.uid()))::text
  and (
    ((storage.foldername(name))[2] = 'love' and public.site_feature_enabled('love_wall'))
    or
    (coalesce((storage.foldername(name))[2], '') <> 'love' and public.site_feature_enabled('album_photos'))
  )
);

commit;
