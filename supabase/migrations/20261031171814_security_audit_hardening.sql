-- Round-two security hardening: event roster visibility and Storage MIME allowlists.
begin;

-- Event registrations are a member-facing roster, not a public directory.
-- Joined members/admins can view the roster; unjoined accounts can only see their own row.
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

-- A non-member must not be able to join a class event before joining the community.
drop policy if exists er_ins on public.event_regs;
create policy er_ins
on public.event_regs
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and (
    public.is_member()
    or public.my_role() in ('admin', 'super_admin')
  )
);

-- Rate-limit authenticated feedback emails per account without storing feedback text or contact details.
create schema if not exists feedback_private;
revoke all on schema feedback_private from public, anon, authenticated;
grant usage on schema feedback_private to service_role;

create table if not exists feedback_private.dev_feedback_attempts (
  id bigint generated always as identity primary key,
  profile_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists dev_feedback_attempts_profile_time_idx
  on feedback_private.dev_feedback_attempts (profile_id, attempted_at desc);
alter table feedback_private.dev_feedback_attempts enable row level security;
revoke all on table feedback_private.dev_feedback_attempts from public, anon, authenticated;
grant select, insert, delete on table feedback_private.dev_feedback_attempts to service_role;

create or replace function public.consume_dev_feedback_attempt(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, feedback_private
as $function$
declare
  v_count integer;
begin
  if p_profile_id is null then
    raise exception 'profile id required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_profile_id::text, 0));
  delete from feedback_private.dev_feedback_attempts
   where attempted_at < pg_catalog.now() - interval '1 day';

  select count(*)::integer into v_count
    from feedback_private.dev_feedback_attempts
   where profile_id = p_profile_id
     and attempted_at >= pg_catalog.now() - interval '1 hour';

  if v_count >= 3 then
    return false;
  end if;

  insert into feedback_private.dev_feedback_attempts(profile_id) values (p_profile_id);
  return true;
end;
$function$;

revoke all on function public.consume_dev_feedback_attempt(uuid) from public, anon, authenticated;
grant execute on function public.consume_dev_feedback_attempt(uuid) to service_role;

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
