-- Phase 4: account-synced preferences, capsule read state and complete growth totals.

begin;

create table if not exists public.profile_notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default
    '{"motion":"system","notifications":{"comment":true,"like":true,"greeting":true,"notice":true,"feedback":true,"love_wall":true}}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint profile_notification_preferences_object_check
    check (jsonb_typeof(preferences) = 'object')
);

alter table public.profile_notification_preferences enable row level security;
revoke all on table public.profile_notification_preferences from public, anon, authenticated;
grant select, insert on table public.profile_notification_preferences to authenticated;
grant update (preferences) on table public.profile_notification_preferences to authenticated;

drop policy if exists profile_notification_preferences_select_own on public.profile_notification_preferences;
create policy profile_notification_preferences_select_own
on public.profile_notification_preferences
for select to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists profile_notification_preferences_insert_own on public.profile_notification_preferences;
create policy profile_notification_preferences_insert_own
on public.profile_notification_preferences
for insert to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists profile_notification_preferences_update_own on public.profile_notification_preferences;
create policy profile_notification_preferences_update_own
on public.profile_notification_preferences
for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create or replace function public.touch_profile_notification_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.touch_profile_notification_preferences_updated_at() from public, anon, authenticated;

drop trigger if exists profile_notification_preferences_touch_updated_at on public.profile_notification_preferences;
create trigger profile_notification_preferences_touch_updated_at
before update on public.profile_notification_preferences
for each row execute function public.touch_profile_notification_preferences_updated_at();

create table if not exists public.capsule_reads (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capsule_id bigint not null references public.time_capsules(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, capsule_id)
);

alter table public.capsule_reads enable row level security;
revoke all on table public.capsule_reads from public, anon, authenticated;
grant select, insert on table public.capsule_reads to authenticated;

drop policy if exists capsule_reads_select_own on public.capsule_reads;
create policy capsule_reads_select_own
on public.capsule_reads
for select to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists capsule_reads_insert_own_opened on public.capsule_reads;
create policy capsule_reads_insert_own_opened
on public.capsule_reads
for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.time_capsules c
    where c.id = capsule_id
      and c.deleted_at is null
      and c.open_at <= current_date
      and (c.is_public = true or c.author_id = (select auth.uid()))
  )
);

create or replace function public.get_my_growth_summary()
returns table (
  posts bigint,
  comments bigint,
  photos bigint,
  notices bigint,
  events bigint,
  active_days bigint,
  seventh_active_day date,
  first_post_at timestamptz,
  first_photo_at timestamptz,
  tenth_comment_at timestamptz,
  first_event_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with activity_dates as (
    select (p.created_at at time zone 'UTC')::date as activity_date
    from public.posts p
    where p.author_id = (select auth.uid()) and p.deleted_at is null

    union all

    select (c.created_at at time zone 'UTC')::date
    from public.comments c
    where c.author_id = (select auth.uid()) and c.deleted_at is null

    union all

    select (a.created_at at time zone 'UTC')::date
    from public.album_photos a
    where a.uploaded_by = (select auth.uid())

    union all

    select (b.created_at at time zone 'UTC')::date
    from public.board_messages b
    where b.author_id = (select auth.uid())
      and b.is_admin_msg = false
      and b.deleted_at is null

    union all

    select (e.created_at at time zone 'UTC')::date
    from public.event_regs e
    where e.profile_id = (select auth.uid())
  ),
  distinct_days as (
    select distinct activity_date
    from activity_dates
    where activity_date is not null
  ),
  post_stats as (
    select count(*)::bigint as total, min(p.created_at) as first_at
    from public.posts p
    where p.author_id = (select auth.uid()) and p.deleted_at is null
  ),
  comment_stats as (
    select
      count(*)::bigint as total,
      (
        select c2.created_at
        from public.comments c2
        where c2.author_id = (select auth.uid()) and c2.deleted_at is null
        order by c2.created_at asc
        offset 9 limit 1
      ) as tenth_at
    from public.comments c
    where c.author_id = (select auth.uid()) and c.deleted_at is null
  ),
  photo_stats as (
    select count(*)::bigint as total, min(a.created_at) as first_at
    from public.album_photos a
    where a.uploaded_by = (select auth.uid())
  ),
  board_stats as (
    select count(*)::bigint as total
    from public.board_messages b
    where b.author_id = (select auth.uid())
      and b.is_admin_msg = false
      and b.deleted_at is null
  ),
  event_stats as (
    select count(*)::bigint as total, min(e.created_at) as first_at
    from public.event_regs e
    where e.profile_id = (select auth.uid())
  )
  select
    post_stats.total,
    comment_stats.total,
    photo_stats.total,
    board_stats.total,
    event_stats.total,
    (select count(*)::bigint from distinct_days),
    (select d.activity_date from distinct_days d order by d.activity_date offset 6 limit 1),
    post_stats.first_at,
    photo_stats.first_at,
    comment_stats.tenth_at,
    event_stats.first_at
  from post_stats, comment_stats, photo_stats, board_stats, event_stats;
$$;

revoke all on function public.get_my_growth_summary() from public, anon;
grant execute on function public.get_my_growth_summary() to authenticated;

commit;
