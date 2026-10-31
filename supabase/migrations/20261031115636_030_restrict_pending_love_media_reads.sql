-- 030: Restrict reads of confession-wall attachment rows and objects.
-- Other media paths (albums, timelines, etc.) keep their existing member access.
-- Love-wall objects are readable only by the uploader, admins, or authenticated
-- users when the linked post has been published.

create index if not exists love_wall_media_path_idx
  on public.love_wall_media(path);

-- SECURITY DEFINER is intentional: the helper must inspect the linked post
-- without being blocked by the caller's row policy on love_wall_posts.
create or replace function public.love_wall_media_object_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.love_wall_media m
    join public.love_wall_posts p on p.id = m.post_id
    where m.path = p_path
      and (
        p.status = 'published'
        or p.author_id = auth.uid()
        or public.my_role() in ('admin', 'super_admin')
      )
  );
$function$;

revoke all on function public.love_wall_media_object_readable(text) from public, anon;
grant execute on function public.love_wall_media_object_readable(text) to authenticated;

-- Keep attachment-row visibility consistent with the linked post status.
drop policy if exists love_wall_media_read on public.love_wall_media;
create policy love_wall_media_read on public.love_wall_media
for select to authenticated
using (public.love_wall_media_object_readable(path));

-- The bucket policy is broader than the attachment table policy, so mirror
-- the same authorization at the object layer. Non-love media is unchanged.
drop policy if exists media_sel on storage.objects;
create policy media_sel on storage.objects
for select to authenticated
using (
  bucket_id = 'media'
  and (
    (
      (storage.foldername(name))[2] = 'love'
      and (
        (storage.foldername(name))[1] = (auth.uid())::text
        or public.my_role() in ('admin', 'super_admin')
        or public.love_wall_media_object_readable(name)
      )
    )
    or (
      (storage.foldername(name))[2] is distinct from 'love'
      and (
        public.is_member()
        or (storage.foldername(name))[1] = (auth.uid())::text
      )
    )
  )
);
