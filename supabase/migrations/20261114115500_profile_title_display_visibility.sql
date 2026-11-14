-- Allow members to choose one earned community title and control whether it appears on their profile.
begin;

alter table public.profiles
  add column if not exists profile_title text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_profile_title_allowed'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_profile_title_allowed
      check (
        profile_title is null
        or profile_title in (
          '青春初见',
          '第一次分享',
          '留下影像',
          '热心互动',
          '活动同行',
          '七日足迹',
          '周年纪念'
        )
      );
  end if;
end $$;

alter table public.profile_privacy
  add column if not exists show_title boolean not null default false;

drop function if exists public.member_detail(uuid);

create function public.member_detail(uid uuid)
returns table(
  id uuid,
  username text,
  display_name text,
  age int,
  personality text,
  signature text,
  bio text,
  hobbies text,
  avatar_path text,
  theme jsonb,
  contact text,
  social text,
  game_id text,
  profile_title text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username::text,
    case when pr.show_name then p.display_name end,
    case when pr.show_age then p.age end,
    case when pr.show_personality then p.personality end,
    case when pr.show_signature then p.signature end,
    case when pr.show_bio then p.bio end,
    case when pr.show_hobbies then p.hobbies end,
    case when pr.show_avatar then p.avatar_path end,
    p.theme,
    case when pr.show_contact then c.contact end,
    case when pr.show_social then c.social end,
    case when pr.show_game_id then c.game_id end,
    case when pr.show_title or p.id = auth.uid() then p.profile_title end
  from public.profiles p
  join public.profile_privacy pr on pr.profile_id = p.id
  join public.profile_contacts c on c.profile_id = p.id
  where p.id = uid
    and public.is_member()
    and p.joined;
$$;

revoke all on function public.member_detail(uuid) from public, anon;
grant execute on function public.member_detail(uuid) to authenticated, service_role;

create or replace function public.set_my_profile_title(p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_summary record;
  v_created_at timestamptz;
  v_eligible boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_title is null or btrim(p_title) = '' then
    update public.profiles set profile_title = null where id = v_uid;
    return;
  end if;

  select created_at into v_created_at
  from public.profiles
  where id = v_uid;

  select * into v_summary
  from public.get_my_growth_summary();

  case p_title
    when '青春初见' then
      v_eligible := v_created_at is not null;
    when '第一次分享' then
      v_eligible := v_summary.first_post_at is not null;
    when '留下影像' then
      v_eligible := v_summary.first_photo_at is not null;
    when '热心互动' then
      v_eligible := v_summary.tenth_comment_at is not null;
    when '活动同行' then
      v_eligible := v_summary.first_event_at is not null;
    when '七日足迹' then
      v_eligible := v_summary.seventh_active_day is not null;
    when '周年纪念' then
      v_eligible := v_created_at is not null
        and now() >= v_created_at + interval '1 year';
    else
      v_eligible := false;
  end case;

  if not v_eligible then
    raise exception 'title_not_earned' using errcode = '22023';
  end if;

  update public.profiles
  set profile_title = p_title
  where id = v_uid;
end;
$$;

revoke all on function public.set_my_profile_title(text) from public, anon;
grant execute on function public.set_my_profile_title(text) to authenticated;

commit;
