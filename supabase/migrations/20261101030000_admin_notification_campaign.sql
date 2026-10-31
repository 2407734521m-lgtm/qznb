-- Admin in-app notification campaigns with bounded recipients and audit logging.

begin;

create or replace function public.admin_send_notification_campaign(
  p_title text,
  p_body text,
  p_link text default null,
  p_recipient_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_ids uuid[];
  v_count integer;
  v_sent integer;
  v_link text := nullif(pg_catalog.btrim(p_link), '');
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) < 1
     or pg_catalog.char_length(pg_catalog.btrim(p_title)) > 120
     or p_body is null or pg_catalog.char_length(pg_catalog.btrim(p_body)) < 1
     or pg_catalog.char_length(pg_catalog.btrim(p_body)) > 2000
     or (v_link is not null and (
       pg_catalog.char_length(v_link) > 300
       or left(v_link, 1) <> '/'
       or left(v_link, 2) = '//'
     )) then
    raise exception 'invalid notification content or link';
  end if;

  if (
    select count(*) from public.admin_audit_logs l
    where l.actor = v_actor
      and l.action = 'notification_campaign_sent'
      and l.created_at >= pg_catalog.now() - interval '1 hour'
  ) >= 20 then
    raise exception 'notification campaign rate limit reached';
  end if;

  if p_recipient_ids is null then
    select count(*)::integer into v_count
      from public.profiles p
     where p.joined = true;
    if v_count > 1000 then
      raise exception 'joined member count exceeds 1000; use selected batches';
    end if;
    select array_agg(p.id order by p.created_at desc)
      into v_ids
      from public.profiles p
     where p.joined = true;
  else
    if cardinality(p_recipient_ids) < 1 or cardinality(p_recipient_ids) > 100 then
      raise exception 'selected recipient count must be 1 to 100';
    end if;

    select array_agg(distinct x.id)
      into v_ids
      from unnest(p_recipient_ids) as x(id);

    if coalesce(cardinality(v_ids), 0) <> (
      select count(*) from public.profiles p
      where p.id = any(v_ids) and p.joined = true
    ) then
      raise exception 'one or more recipients are unavailable or not joined';
    end if;
  end if;

  v_count := coalesce(cardinality(v_ids), 0);
  if v_count < 1 then
    raise exception 'no eligible recipients';
  end if;
  if v_count > 1000 then
    raise exception 'recipient limit exceeded';
  end if;

  insert into public.notifications(profile_id, type, title, body, link)
  select
    x.id,
    'notice',
    pg_catalog.btrim(p_title),
    pg_catalog.btrim(p_body),
    coalesce(v_link, '/me/notifications')
  from unnest(v_ids) as x(id);

  get diagnostics v_sent = row_count;

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'notification_campaign_sent',
    pg_catalog.jsonb_build_object(
      'recipient_count', v_sent,
      'title', pg_catalog.btrim(p_title),
      'scope', case when p_recipient_ids is null then 'all_joined' else 'selected' end
    )
  );

  return v_sent;
end;
$function$;

revoke all on function public.admin_send_notification_campaign(text, text, text, uuid[]) from public, anon;
grant execute on function public.admin_send_notification_campaign(text, text, text, uuid[]) to authenticated;

commit;
