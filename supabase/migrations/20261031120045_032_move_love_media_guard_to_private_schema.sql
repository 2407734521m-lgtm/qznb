-- 032: Keep the confession-media authorization helper out of the exposed API schema.
-- The helper is called by RLS policies only; it is not intended as a public RPC.

create schema if not exists love_private;
revoke all on schema love_private from public, anon;
grant usage on schema love_private to authenticated;

create or replace function love_private.love_wall_media_object_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and exists (
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

revoke all on function love_private.love_wall_media_object_readable(text) from public, anon;
grant execute on function love_private.love_wall_media_object_readable(text) to authenticated;

drop policy if exists love_wall_media_read on public.love_wall_media;
create policy love_wall_media_read on public.love_wall_media
for select to authenticated
using (love_private.love_wall_media_object_readable(path));

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
        or love_private.love_wall_media_object_readable(name)
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

drop function public.love_wall_media_object_readable(text);
