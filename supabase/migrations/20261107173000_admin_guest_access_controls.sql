-- Allow both admin and super_admin to manage only the guest-access allowlist.
-- This does not grant general site_settings write access.

create or replace function public.admin_get_guest_access_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'guest_browse_enabled', coalesce((select s.value from public.site_settings s where s.key = 'guest_browse_enabled' limit 1), 'true'),
    'guest_entry_visible', coalesce((select s.value from public.site_settings s where s.key = 'guest_entry_visible' limit 1), 'true'),
    'guest_session_minutes', case
      when (select s.value from public.site_settings s where s.key = 'guest_session_minutes' limit 1)
        = any (array['15','30','60','120','240','480','720','1440']::text[])
      then (select s.value from public.site_settings s where s.key = 'guest_session_minutes' limit 1)
      else '60'
    end,
    'guest_session_epoch', coalesce((select s.value from public.site_settings s where s.key = 'guest_session_epoch' limit 1), '1'),
    'guest_show_love_wall', coalesce((select s.value from public.site_settings s where s.key = 'guest_show_love_wall' limit 1), 'true'),
    'guest_show_announcements', coalesce((select s.value from public.site_settings s where s.key = 'guest_show_announcements' limit 1), 'true'),
    'guest_schedule', coalesce((select s.value from public.site_settings s where s.key = 'guest_schedule' limit 1), '{"enabled":false,"start_at":null,"end_at":null}')
  );
end;
$function$;

revoke all on function public.admin_get_guest_access_settings() from public, anon;
grant execute on function public.admin_get_guest_access_settings() to authenticated;

create or replace function public.admin_save_guest_access_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_schedule jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_enabled boolean;
  v_epoch numeric;
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key is null or p_value is null or pg_catalog.char_length(p_value) > 4000 then
    raise exception 'invalid setting value' using errcode = '22023';
  end if;

  if p_key = any (array[
    'guest_browse_enabled', 'guest_entry_visible',
    'guest_show_love_wall', 'guest_show_announcements'
  ]::text[]) then
    if p_value not in ('true', 'false') then
      raise exception 'invalid boolean setting' using errcode = '22023';
    end if;
  elsif p_key = 'guest_session_minutes' then
    if not (p_value = any (array['15','30','60','120','240','480','720','1440']::text[])) then
      raise exception 'unsupported guest session duration' using errcode = '22023';
    end if;
  elsif p_key = 'guest_session_epoch' then
    if p_value !~ '^[0-9]{1,16}$' then
      raise exception 'invalid guest session version' using errcode = '22023';
    end if;
    v_epoch := p_value::numeric;
    if v_epoch < 1 or v_epoch >= 9007199254740991 then
      raise exception 'guest session version out of range' using errcode = '22023';
    end if;
  elsif p_key = 'guest_schedule' then
    begin
      v_schedule := p_value::jsonb;
      if pg_catalog.jsonb_typeof(v_schedule) <> 'object' then
        raise exception 'schedule must be an object';
      end if;
      v_enabled := coalesce((v_schedule ->> 'enabled')::boolean, false);
      if v_enabled then
        v_start := nullif(v_schedule ->> 'start_at', '')::timestamptz;
        v_end := nullif(v_schedule ->> 'end_at', '')::timestamptz;
        if v_start is null or v_end is null or v_end <= v_start then
          raise exception 'invalid guest schedule range';
        end if;
      end if;
    exception when others then
      raise exception 'invalid guest schedule' using errcode = '22023';
    end;
  else
    raise exception 'guest setting key is not allowed' using errcode = '22023';
  end if;

  insert into public.site_settings(key, value)
  values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    auth.uid(),
    'guest_setting_change',
    pg_catalog.jsonb_build_object('key', p_key)
      || case
        when p_key = 'guest_schedule'
          then pg_catalog.jsonb_build_object('enabled', coalesce(v_enabled, false))
        else pg_catalog.jsonb_build_object('value', p_value)
      end
  );
end;
$function$;

revoke all on function public.admin_save_guest_access_setting(text, text) from public, anon;
grant execute on function public.admin_save_guest_access_setting(text, text) to authenticated;
