-- Audit remediation: opaque confession media paths and owner-aware avatar reads.
-- This migration is additive; it does not rewrite existing production migration history.
begin;

create schema if not exists love_private;
revoke all on schema love_private from public, anon;
grant usage on schema love_private to authenticated;

create table if not exists love_private.media_objects (
  object_path text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id bigint references public.love_wall_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on love_private.media_objects from public, anon, authenticated;

create or replace function love_private.can_upload_love_media(p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null
    and p_path like 'love/%'
    and exists (
      select 1 from love_private.media_objects m
      where m.object_path = p_path and m.owner_id = auth.uid() and m.post_id is null
    )
    and public.site_feature_enabled('love_wall');
$function$;

create or replace function love_private.love_wall_media_object_readable(p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and (
    exists (
      select 1
      from love_private.media_objects m
      join public.love_wall_posts p on p.id = m.post_id
      where m.object_path = p_path
        and (p.status = 'published' or m.owner_id = auth.uid()
          or public.my_role() in ('admin', 'super_admin'))
    )
    or exists (
      select 1
      from public.love_wall_media lm
      join public.love_wall_posts lp on lp.id = lm.post_id
      where lm.path = p_path
        and (lp.status = 'published' or lp.author_id = auth.uid()
          or public.my_role() in ('admin', 'super_admin'))
    )
  );
$function$;

revoke all on function love_private.can_upload_love_media(text) from public, anon;
grant execute on function love_private.can_upload_love_media(text) to authenticated;
revoke all on function love_private.love_wall_media_object_readable(text) from public, anon;
grant execute on function love_private.love_wall_media_object_readable(text) to authenticated;

create or replace function public.register_love_wall_media_upload(p_path text)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null
    or p_path is null
    or p_path !~ '^love/[a-f0-9-]{36}[.][a-z0-9]{1,8}$'
    or not public.site_feature_enabled('love_wall') then
    raise exception 'invalid confession media upload' using errcode = '42501';
  end if;
  insert into love_private.media_objects(object_path, owner_id)
  values (p_path, auth.uid())
  on conflict (object_path) do nothing;
  if not exists (
    select 1 from love_private.media_objects m
    where m.object_path = p_path and m.owner_id = auth.uid() and m.post_id is null
  ) then
    raise exception 'confession media path is unavailable' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.link_love_wall_media_post(p_path text, p_post_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  update love_private.media_objects m
     set post_id = p_post_id
   where m.object_path = p_path
     and m.owner_id = auth.uid()
     and m.post_id is null
     and exists (
       select 1 from public.love_wall_posts p
       where p.id = p_post_id and p.author_id = auth.uid()
     );
  if not found then
    raise exception 'confession media link denied' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.register_love_wall_media_upload(text) from public, anon;
grant execute on function public.register_love_wall_media_upload(text) to authenticated;
revoke all on function public.link_love_wall_media_post(text, bigint) from public, anon;
grant execute on function public.link_love_wall_media_post(text, bigint) to authenticated;

drop policy if exists media_ins on storage.objects;
create policy media_ins on storage.objects
for insert to authenticated
with check (
  bucket_id = 'media'
  and (
    love_private.can_upload_love_media(name)
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and coalesce((storage.foldername(name))[2], '') <> 'love'
      and public.site_feature_enabled('album_photos')
    )
  )
);

drop policy if exists media_del on storage.objects;
create policy media_del on storage.objects
for delete to authenticated
using (
  bucket_id = 'media'
  and (
    (
      (storage.foldername(name))[1] = 'love'
      and exists (select 1 from love_private.media_objects m where m.object_path = name and m.owner_id = auth.uid())
    )
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and coalesce((storage.foldername(name))[2], '') <> 'love'
    )
  )
);

drop policy if exists media_sel on storage.objects;
create policy media_sel on storage.objects
for select to authenticated
using (
  bucket_id = 'media'
  and (
    (
      (storage.foldername(name))[1] = 'love'
      and love_private.love_wall_media_object_readable(name)
    )
    or (
      (storage.foldername(name))[2] = 'love'
      and love_private.love_wall_media_object_readable(name)
    )
    or (
      (storage.foldername(name))[1] <> 'love'
      and coalesce((storage.foldername(name))[2], '') <> 'love'
      and (public.is_member() or (storage.foldername(name))[1] = (select auth.uid())::text)
    )
  )
);

-- Hidden avatars are private to their owner and administrators.
create or replace function love_private.avatar_object_readable(p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.profiles p
    left join public.profile_privacy pr on pr.profile_id = p.id
    where p.avatar_path = p_path
      and (
        p.id = auth.uid()
        or public.my_role() in ('admin', 'super_admin')
        or (public.is_member() and coalesce(pr.show_avatar, true))
      )
  );
$function$;
revoke all on function love_private.avatar_object_readable(text) from public, anon;
grant execute on function love_private.avatar_object_readable(text) to authenticated;

drop policy if exists av_sel on storage.objects;
create policy av_sel on storage.objects
for select to authenticated
using (bucket_id = 'avatars' and love_private.avatar_object_readable(name));

-- Place the foreign-key indexes after their dependent tables/columns exist.
do $indexes$
begin
  if to_regclass('admin_private.sensitive_action_requests') is not null then
    execute 'create index if not exists sensitive_action_requests_requester_id_idx on admin_private.sensitive_action_requests(requester_id)';
    execute 'create index if not exists sensitive_action_requests_decided_by_idx on admin_private.sensitive_action_requests(decided_by)';
  end if;
  if to_regclass('maintenance_private.access_codes') is not null then
    execute 'create index if not exists access_codes_created_by_idx on maintenance_private.access_codes(created_by)';
  end if;
  if to_regclass('public.admin_email_campaign_recipients') is not null then
    execute 'create index if not exists admin_email_campaign_recipients_profile_id_idx on public.admin_email_campaign_recipients(profile_id)';
  end if;
  if to_regclass('public.admin_email_campaigns') is not null then
    execute 'create index if not exists admin_email_campaigns_actor_created_idx on public.admin_email_campaigns(actor_id, created_at desc)';
  end if;
  if to_regclass('public.feedbacks') is not null and exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='feedbacks' and column_name='handled_by'
  ) then
    execute 'create index if not exists feedbacks_handled_by_idx on public.feedbacks(handled_by)';
  end if;
  if to_regclass('public.love_wall_comments') is not null then
    execute 'create index if not exists love_wall_comments_author_id_idx on public.love_wall_comments(author_id)';
  end if;
  if to_regclass('maintenance_private.access_attempts') is not null then
    execute 'create index if not exists access_attempts_ip_time_idx on maintenance_private.access_attempts(client_ip, attempted_at desc)';
  end if;
end;
$indexes$;

commit;
