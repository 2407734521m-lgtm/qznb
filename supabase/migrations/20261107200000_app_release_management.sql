-- App-only release management, announcements, and last-seen client platform.
begin;

alter table public.member_presence
  add column if not exists client_platform text not null default 'web',
  add column if not exists app_version_name text,
  add column if not exists app_version_code integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.member_presence'::regclass
      and conname = 'member_presence_client_platform_check'
  ) then
    alter table public.member_presence
      add constraint member_presence_client_platform_check
      check (client_platform in ('web', 'mobile'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.member_presence'::regclass
      and conname = 'member_presence_app_version_code_check'
  ) then
    alter table public.member_presence
      add constraint member_presence_app_version_code_check
      check (app_version_code is null or app_version_code >= 0);
  end if;
end $$;

create index if not exists member_presence_platform_updated_idx
  on public.member_presence (client_platform, updated_at desc);

create table if not exists public.app_releases (
  id bigint generated always as identity primary key,
  version_name text not null check (char_length(btrim(version_name)) between 1 and 40),
  version_code integer not null unique check (version_code > 0),
  apk_url text not null check (apk_url ~ '^https://'),
  update_notes text not null default '' check (char_length(update_notes) <= 4000),
  force_update boolean not null default false,
  min_code integer not null default 0 check (min_code >= 0),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now()
);

alter table public.app_releases enable row level security;
revoke all on table public.app_releases from public, anon, authenticated;

create table if not exists public.app_announcements (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  show_popup boolean not null default true,
  is_published boolean not null default true,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint app_announcements_expiry_check check (expires_at is null or published_at is null or expires_at > published_at)
);

create index if not exists app_announcements_published_idx
  on public.app_announcements (published_at desc)
  where is_published = true;

alter table public.app_announcements enable row level security;
revoke all on table public.app_announcements from public, anon, authenticated;

create table if not exists public.app_announcement_reads (
  announcement_id bigint not null references public.app_announcements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

alter table public.app_announcement_reads enable row level security;
revoke all on table public.app_announcement_reads from public, anon, authenticated;

create or replace function public.admin_publish_app_release(
  p_version_name text,
  p_version_code integer,
  p_apk_url text,
  p_notes text default '',
  p_force_update boolean default false,
  p_min_code integer default 0
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_current_code integer;
  v_release_id bigint;
  v_url text := pg_catalog.btrim(coalesce(p_apk_url, ''));
  v_name text := pg_catalog.btrim(coalesce(p_version_name, ''));
  v_notes text := coalesce(p_notes, '');
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_name) not between 1 and 40
     or p_version_code is null or p_version_code < 1
     or pg_catalog.char_length(v_notes) > 4000
     or v_url !~ '^https://'
     or pg_catalog.char_length(v_url) > 1000
     or p_min_code is null or p_min_code < 0
     or p_min_code > p_version_code then
    raise exception 'invalid release information' using errcode = '22023';
  end if;

  select coalesce(nullif(s.value, '')::integer, 0)
    into v_current_code
    from public.site_settings s
   where s.key = 'app_version_code';
  v_current_code := coalesce(v_current_code, 0);

  if p_version_code <= v_current_code then
    raise exception 'new version code must be greater than the current version (%)', v_current_code
      using errcode = '22023';
  end if;

  insert into public.app_releases(
    version_name, version_code, apk_url, update_notes, force_update, min_code, published_by
  ) values (
    v_name, p_version_code, v_url, v_notes, coalesce(p_force_update, false), p_min_code, v_actor
  )
  returning id into v_release_id;

  insert into public.site_settings(key, value)
  values
    ('app_version_name', v_name),
    ('app_version_code', p_version_code::text),
    ('app_apk_url', v_url),
    ('app_update_notes', v_notes),
    ('app_force_update', coalesce(p_force_update, false)::text),
    ('app_min_code', p_min_code::text)
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'app_release_published',
    pg_catalog.jsonb_build_object(
      'release_id', v_release_id,
      'version_name', v_name,
      'version_code', p_version_code,
      'force_update', coalesce(p_force_update, false),
      'min_code', p_min_code
    )
  );

  return v_release_id;
end;
$function$;

create or replace function public.admin_list_app_releases()
returns table(
  id bigint,
  version_name text,
  version_code integer,
  apk_url text,
  update_notes text,
  force_update boolean,
  min_code integer,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  return query
  select r.id, r.version_name, r.version_code, r.apk_url, r.update_notes,
         r.force_update, r.min_code, r.published_at
    from public.app_releases r
   order by r.published_at desc
   limit 30;
end;
$function$;

create or replace function public.admin_create_app_announcement(
  p_title text,
  p_body text,
  p_show_popup boolean default true,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_id bigint;
  v_recipients integer := 0;
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_title) not between 1 and 100
     or pg_catalog.char_length(v_body) not between 1 and 3000
     or (p_expires_at is not null and p_expires_at <= now()) then
    raise exception 'invalid announcement content or expiry' using errcode = '22023';
  end if;

  if (
    select count(*) from public.admin_audit_logs l
     where l.actor = v_actor
       and l.action = 'app_announcement_published'
       and l.created_at >= now() - interval '1 hour'
  ) >= 20 then
    raise exception 'announcement rate limit reached' using errcode = 'P0001';
  end if;

  insert into public.app_announcements(
    title, body, show_popup, is_published, published_at, expires_at, created_by
  ) values (
    v_title, v_body, coalesce(p_show_popup, true), true, now(), p_expires_at, v_actor
  ) returning id into v_id;

  -- Only accounts whose latest authenticated client heartbeat identifies the
  -- installed app receive the app-specific inbox notification.
  insert into public.notifications(profile_id, type, title, body, link, is_read)
  select p.id, 'app_announcement', v_title, v_body, '/me/notifications?app_announcement=' || v_id::text, false
    from public.profiles p
    join public.member_presence mp on mp.profile_id = p.id
   where p.role = 'member'
     and p.joined = true
     and mp.client_platform = 'mobile';

  get diagnostics v_recipients = row_count;

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'app_announcement_published',
    pg_catalog.jsonb_build_object(
      'announcement_id', v_id,
      'recipient_count', v_recipients,
      'show_popup', coalesce(p_show_popup, true)
    )
  );

  return pg_catalog.jsonb_build_object(
    'id', v_id,
    'recipient_count', v_recipients
  );
end;
$function$;

create or replace function public.admin_list_app_announcements()
returns table(
  id bigint,
  title text,
  body text,
  show_popup boolean,
  is_published boolean,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  return query
  select a.id, a.title, a.body, a.show_popup, a.is_published,
         a.published_at, a.expires_at, a.created_at
    from public.app_announcements a
   order by a.created_at desc
   limit 50;
end;
$function$;

create or replace function public.admin_set_app_announcement_status(
  p_announcement_id bigint,
  p_is_published boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_announcement_id is null then
    raise exception 'announcement id is required' using errcode = '22023';
  end if;

  update public.app_announcements
     set is_published = coalesce(p_is_published, false),
         published_at = case
           when coalesce(p_is_published, false) then coalesce(published_at, now())
           else published_at
         end
   where id = p_announcement_id;

  if not found then
    raise exception 'announcement not found' using errcode = 'P0002';
  end if;

  if coalesce(p_is_published, false) then
    insert into public.notifications(profile_id, type, title, body, link, is_read)
    select p.id, 'app_announcement', a.title, a.body,
           '/me/notifications?app_announcement=' || a.id::text, false
      from public.app_announcements a
      join public.profiles p on p.joined = true and p.role = 'member'
      join public.member_presence mp on mp.profile_id = p.id and mp.client_platform = 'mobile'
     where a.id = p_announcement_id;
  else
    delete from public.notifications
     where type = 'app_announcement'
       and link = '/me/notifications?app_announcement=' || p_announcement_id::text;
  end if;

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'app_announcement_status_changed',
    pg_catalog.jsonb_build_object('announcement_id', p_announcement_id, 'is_published', p_is_published)
  );
end;
$function$;

create or replace function public.admin_client_platform_members()
returns table(
  id uuid,
  username text,
  display_name text,
  client_platform text,
  device text,
  app_version_name text,
  app_version_code integer,
  presence_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  return query
  select p.id, p.username::text, p.display_name,
         coalesce(mp.client_platform, 'unknown'),
         mp.device, mp.app_version_name, mp.app_version_code, mp.updated_at
    from public.profiles p
    left join public.member_presence mp on mp.profile_id = p.id
   where p.role = 'member'
     and p.joined = true
   order by mp.updated_at desc nulls last, p.created_at desc
   limit 1000;
end;
$function$;

create or replace function public.public_app_announcements()
returns table(
  id bigint,
  title text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select a.id, a.title, a.body, a.created_at
    from public.app_announcements a
   where auth.uid() is not null
     and exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.joined = true
     )
     and exists (
       select 1 from public.member_presence mp
        where mp.profile_id = auth.uid() and mp.client_platform = 'mobile'
     )
     and a.is_published = true
     and a.show_popup = true
     and (a.expires_at is null or a.expires_at > now())
     and not exists (
       select 1 from public.app_announcement_reads rd
        where rd.announcement_id = a.id and rd.profile_id = auth.uid()
     )
   order by a.published_at desc
   limit 5;
$function$;

create or replace function public.mark_app_announcement_read(p_announcement_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.joined = true
     )
     or not exists (
       select 1 from public.member_presence mp
        where mp.profile_id = auth.uid() and mp.client_platform = 'mobile'
     ) then
    raise exception 'mobile app member required' using errcode = '42501';
  end if;

  insert into public.app_announcement_reads(announcement_id, profile_id)
  select a.id, auth.uid()
    from public.app_announcements a
   where a.id = p_announcement_id
     and a.is_published = true
     and a.show_popup = true
     and (a.expires_at is null or a.expires_at > now())
  on conflict (announcement_id, profile_id) do nothing;
end;
$function$;

-- App update metadata is only returned to joined accounts whose latest client is
-- the installed Android app. The app records its platform before calling this RPC.
create or replace function public.public_app_update()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select case when auth.uid() is not null
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.joined = true
    )
    and exists (
      select 1 from public.member_presence mp
       where mp.profile_id = auth.uid() and mp.client_platform = 'mobile'
    )
  then pg_catalog.jsonb_build_object(
    'app_version_name', coalesce((select value from public.site_settings where key = 'app_version_name' limit 1), ''),
    'app_version_code', coalesce((select value from public.site_settings where key = 'app_version_code' limit 1), '0'),
    'app_update_notes', coalesce((select value from public.site_settings where key = 'app_update_notes' limit 1), ''),
    'app_apk_url', coalesce((select value from public.site_settings where key = 'app_apk_url' limit 1), ''),
    'app_force_update', coalesce((select value from public.site_settings where key = 'app_force_update' limit 1), 'false'),
    'app_min_code', coalesce((select value from public.site_settings where key = 'app_min_code' limit 1), '0')
  )
  else null end;
$function$;

-- Account list RPC keeps its existing role boundary while exposing the latest
-- platform and app build used by each member.
drop function if exists public.admin_member_accounts();
create function public.admin_member_accounts()
returns table(
  id uuid,
  username text,
  display_name text,
  real_name text,
  role text,
  joined boolean,
  created_at timestamptz,
  email text,
  last_sign_in_at timestamptz,
  location text,
  device text,
  client_platform text,
  app_version_name text,
  app_version_code integer,
  presence_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  v_role := public.my_role();
  if v_role is null or v_role <> 'super_admin' then
    raise exception 'forbidden';
  end if;

  return query
  select p.id, p.username::text, p.display_name, p.real_name, p.role,
         p.joined, p.created_at, pe.email, u.last_sign_in_at,
         case when mp.location_share_enabled is true then mp.location else null end,
         mp.device, coalesce(mp.client_platform, 'unknown'),
         mp.app_version_name, mp.app_version_code, mp.updated_at
    from public.profiles p
    left join public.profile_emails pe on pe.profile_id = p.id
    left join auth.users u on u.id = p.id
    left join public.member_presence mp on mp.profile_id = p.id
   order by p.created_at desc
   limit 1000;
end;
$function$;

revoke all on function public.admin_publish_app_release(text, integer, text, text, boolean, integer) from public, anon;
revoke all on function public.admin_list_app_releases() from public, anon;
revoke all on function public.admin_create_app_announcement(text, text, boolean, timestamptz) from public, anon;
revoke all on function public.admin_list_app_announcements() from public, anon;
revoke all on function public.admin_set_app_announcement_status(bigint, boolean) from public, anon;
revoke all on function public.admin_client_platform_members() from public, anon;
revoke all on function public.public_app_announcements() from public, anon;
revoke all on function public.mark_app_announcement_read(bigint) from public, anon;
revoke all on function public.public_app_update() from public, anon;
revoke all on function public.admin_member_accounts() from public, anon;

grant execute on function public.admin_publish_app_release(text, integer, text, text, boolean, integer) to authenticated;
grant execute on function public.admin_list_app_releases() to authenticated;
grant execute on function public.admin_create_app_announcement(text, text, boolean, timestamptz) to authenticated;
grant execute on function public.admin_list_app_announcements() to authenticated;
grant execute on function public.admin_set_app_announcement_status(bigint, boolean) to authenticated;
grant execute on function public.admin_client_platform_members() to authenticated;
grant execute on function public.public_app_announcements() to authenticated;
grant execute on function public.mark_app_announcement_read(bigint) to authenticated;
grant execute on function public.public_app_update() to authenticated;
grant execute on function public.admin_member_accounts() to authenticated;

commit;
