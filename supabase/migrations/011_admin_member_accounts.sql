-- 011_admin_member_accounts.sql
-- Super-admin-only account overview. No raw auth.users access from the browser.
-- Location/device fields are self-reported member_presence metadata, not IP geolocation.

begin;

create or replace function public.admin_member_accounts()
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
  presence_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
  select
    p.id,
    p.username::text,
    p.display_name,
    p.real_name,
    p.role,
    p.joined,
    p.created_at,
    pe.email,
    u.last_sign_in_at,
    mp.location,
    mp.device,
    mp.updated_at
  from public.profiles p
  left join public.profile_emails pe on pe.profile_id = p.id
  left join auth.users u on u.id = p.id
  left join public.member_presence mp on mp.profile_id = p.id
  order by p.created_at desc
  limit 1000;
end;
$$;

revoke all on function public.admin_member_accounts() from public, anon, authenticated;
grant execute on function public.admin_member_accounts() to authenticated;

commit;
