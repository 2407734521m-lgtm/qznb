-- Admin-only aggregate online counts; never expose individual presence rows.
create or replace function public.admin_presence_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_online_count bigint := 0;
  v_active_count bigint := 0;
  v_sampled_at timestamptz := pg_catalog.now();
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if coalesce((select public.my_role()), '') not in ('admin', 'super_admin') then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  select
    count(*) filter (where mp.updated_at >= pg_catalog.now() - interval '5 minutes'),
    count(*) filter (where mp.updated_at >= pg_catalog.now() - interval '30 minutes')
  into v_online_count, v_active_count
  from public.member_presence as mp;

  return pg_catalog.jsonb_build_object(
    'online_count', v_online_count,
    'active_count', v_active_count,
    'sampled_at', v_sampled_at
  );
end;
$function$;

revoke all on function public.admin_presence_summary() from public;
revoke all on function public.admin_presence_summary() from anon;
grant execute on function public.admin_presence_summary() to authenticated;

comment on function public.admin_presence_summary() is
  'Admin-only aggregate counts from member_presence. Returns counts only; no member identifiers, device details, or location data.';
