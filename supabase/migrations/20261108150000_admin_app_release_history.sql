-- Independent, auditable release history and atomic publishing for the admin Android app.
begin;

create table if not exists public.admin_app_releases (
  id bigint generated always as identity primary key,
  version_name text not null check (char_length(btrim(version_name)) between 1 and 40),
  version_code integer not null unique check (version_code > 0),
  apk_url text not null check (apk_url ~ '^https://'),
  update_notes text not null default '' check (char_length(update_notes) <= 4000),
  force_update boolean not null default false,
  min_code integer not null default 0 check (min_code >= 0),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint admin_app_release_min_code_check check (min_code <= version_code)
);

alter table public.admin_app_releases enable row level security;
revoke all on table public.admin_app_releases from public, anon, authenticated;

with current_settings as (
  select
    max(value) filter (where key = 'admin_app_version_name') as version_name,
    max(value) filter (where key = 'admin_app_version_code') as version_code,
    max(value) filter (where key = 'admin_app_apk_url') as apk_url,
    max(value) filter (where key = 'admin_app_update_notes') as update_notes,
    max(value) filter (where key = 'admin_app_force_update') as force_update,
    max(value) filter (where key = 'admin_app_min_code') as min_code
  from public.site_settings
  where key in ('admin_app_version_name','admin_app_version_code','admin_app_apk_url',
                'admin_app_update_notes','admin_app_force_update','admin_app_min_code')
)
insert into public.admin_app_releases (
  version_name, version_code, apk_url, update_notes, force_update, min_code
)
select version_name, version_code::integer, apk_url, coalesce(update_notes, ''),
       coalesce(force_update, 'false') = 'true', coalesce(min_code, '0')::integer
from current_settings
where coalesce(version_name, '') <> ''
  and coalesce(version_code, '') ~ '^[1-9][0-9]*$'
  and coalesce(apk_url, '') ~ '^https://'
  and coalesce(min_code, '0') ~ '^[0-9]+$'
  and coalesce(min_code, '0')::integer <= version_code::integer
on conflict (version_code) do nothing;

create or replace function public.admin_publish_admin_app_release(
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
  v_name text := pg_catalog.btrim(coalesce(p_version_name, ''));
  v_url text := pg_catalog.btrim(coalesce(p_apk_url, ''));
  v_notes text := coalesce(p_notes, '');
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_name) not between 1 and 40
     or p_version_code is null or p_version_code < 1
     or pg_catalog.char_length(v_url) > 1000 or v_url !~ '^https://'
     or pg_catalog.char_length(v_notes) > 4000
     or p_min_code is null or p_min_code < 0 or p_min_code > p_version_code then
    raise exception 'invalid admin app release information' using errcode = '22023';
  end if;

  select case when coalesce(s.value, '') ~ '^[0-9]+$' then s.value::integer else 0 end
    into v_current_code
    from public.site_settings s
   where s.key = 'admin_app_version_code';
  v_current_code := coalesce(v_current_code, 0);

  if p_version_code <= v_current_code then
    raise exception 'new admin app version code must be greater than current version (%)', v_current_code
      using errcode = '22023';
  end if;

  insert into public.admin_app_releases (
    version_name, version_code, apk_url, update_notes, force_update, min_code, published_by
  ) values (
    v_name, p_version_code, v_url, v_notes, coalesce(p_force_update, false), p_min_code, v_actor
  ) returning id into v_release_id;

  insert into public.site_settings(key, value)
  values
    ('admin_app_version_name', v_name),
    ('admin_app_version_code', p_version_code::text),
    ('admin_app_apk_url', v_url),
    ('admin_app_update_notes', v_notes),
    ('admin_app_force_update', coalesce(p_force_update, false)::text),
    ('admin_app_min_code', p_min_code::text)
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'admin_app_release_published',
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

create or replace function public.admin_list_admin_app_releases()
returns table (
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
    from public.admin_app_releases r
   order by r.published_at desc
   limit 30;
end;
$function$;

revoke all on function public.admin_publish_admin_app_release(text, integer, text, text, boolean, integer) from public, anon;
grant execute on function public.admin_publish_admin_app_release(text, integer, text, text, boolean, integer) to authenticated;
revoke all on function public.admin_list_admin_app_releases() from public, anon;
grant execute on function public.admin_list_admin_app_releases() to authenticated;

commit;
