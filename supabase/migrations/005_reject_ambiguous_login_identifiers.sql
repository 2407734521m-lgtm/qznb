-- 005: Reject ambiguous login identifiers instead of selecting the newest matching profile.
-- Safe to apply repeatedly. This migration does not alter existing profile data.
-- Login rule is unchanged: only username matching is allowed.
--   * exactly one distinct account matches the username -> return its email;
--   * more than one distinct account matches the username -> return NULL;
--   * no account matches the username -> return NULL.
-- Real-name login is NOT added: p.real_name is never compared here.
-- Ambiguity is judged by distinct account id (and email), not by raw row count alone:
-- profile_emails.profile_id is a primary key (see 004_v2.sql), so one account
-- normally has at most one email row; the DISTINCT on (profile_id, email) also
-- guards the case where an account ever gains a second email row, in which case
-- the result is NULL instead of arbitrarily picking one email.
-- profiles.username is citext, so `p.username = ident` keeps the existing
-- case-insensitive comparison; no lower()/upper() is added.

create or replace function public.resolve_login_email(ident text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select distinct p.id as profile_id, e.email
    from public.profiles p
    join public.profile_emails e on e.profile_id = p.id
    where ident is not null
      and p.username = ident
  )
  select case when count(*) = 1 then min(email) else null end
  from matched;
$$;

revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
