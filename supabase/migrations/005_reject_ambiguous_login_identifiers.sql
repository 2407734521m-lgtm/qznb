-- 005: Reject ambiguous login identifiers instead of selecting the newest matching profile.
-- Safe to apply repeatedly. This migration does not alter existing profile data.
-- If an identifier matches more than one profile by username or real_name, return NULL
-- so the client must not silently authenticate as an arbitrary account.

create or replace function public.resolve_login_email(ident text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with matches as (
    select p.id, e.email,
           case when p.username = ident then 0 else 1 end as match_priority
    from public.profiles p
    join public.profile_emails e on e.profile_id = p.id
    where ident is not null
      and (p.username = ident or p.real_name = ident)
  ),
  best_priority as (
    select min(match_priority) as priority
    from matches
  ),
  best_matches as (
    select m.id, m.email
    from matches m
    cross join best_priority b
    where m.match_priority = b.priority
  )
  select case when count(*) = 1 then min(email) else null end
  from best_matches;
$$;

revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
