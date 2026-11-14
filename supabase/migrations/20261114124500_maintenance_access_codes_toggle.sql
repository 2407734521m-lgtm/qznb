-- Optional maintenance bypass: default to hidden; super admins can enable it explicitly.
-- Existing maintenance mode remains independent from temporary visitor access codes.

insert into public.site_settings (key, value)
values ('maintenance_access_codes_enabled', 'false')
on conflict (key) do nothing;

-- Keep the public landing RPC on its existing explicit allowlist and append only
-- this non-sensitive boolean. The wrapper is SECURITY DEFINER because anon users
-- must not read site_settings directly.
create or replace function public.public_guest_landing()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select
    guest_api_private.public_guest_landing_data()
    || pg_catalog.jsonb_build_object(
      'maintenance_access_codes_enabled',
      coalesce((
        select s.value = 'true'
        from public.site_settings s
        where s.key = 'maintenance_access_codes_enabled'
        limit 1
      ), false)
    );
$function$;

revoke all on function public.public_guest_landing() from public, anon, authenticated;
grant execute on function public.public_guest_landing() to anon, authenticated;

-- Enforce the switch at the database boundary too. Hiding the input in the UI
-- alone would not prevent someone from calling the public redeem RPC directly.
create or replace function maintenance_private.enforce_access_codes_enabled()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, maintenance_private
as $trigger$
begin
  if coalesce((
    select s.value
    from public.site_settings s
    where s.key = 'maintenance_access_codes_enabled'
    limit 1
  ), 'false') <> 'true' then
    raise exception '管理员未开放临时通行码' using errcode = '42501';
  end if;
  return new;
end;
$trigger$;

revoke all on function maintenance_private.enforce_access_codes_enabled() from public, anon, authenticated;

drop trigger if exists maintenance_access_codes_enabled_guard on maintenance_private.access_codes;
create trigger maintenance_access_codes_enabled_guard
  before insert on maintenance_private.access_codes
  for each row execute function maintenance_private.enforce_access_codes_enabled();

drop trigger if exists maintenance_access_sessions_enabled_guard on maintenance_private.access_sessions;
create trigger maintenance_access_sessions_enabled_guard
  before insert on maintenance_private.access_sessions
  for each row execute function maintenance_private.enforce_access_codes_enabled();
