-- 034: Protect public maintenance-notification subscriptions from abuse.
-- Keep anonymous signup, but rate-limit by Cloudflare's edge-provided client IP.

create table if not exists maintenance_private.notify_subscription_attempts (
  id bigint generated always as identity primary key,
  client_ip inet not null,
  attempted_at timestamptz not null default now()
);
create index if not exists notify_subscription_attempts_ip_time_idx
  on maintenance_private.notify_subscription_attempts (client_ip, attempted_at desc);
alter table maintenance_private.notify_subscription_attempts enable row level security;
revoke all on maintenance_private.notify_subscription_attempts from public, anon, authenticated;

create or replace function maintenance_private.enforce_notify_subscription_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, maintenance_private
as $fn$
declare
  v_headers jsonb;
  v_ip_text text;
  v_ip inet;
  v_count integer;
begin
  v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip_text := nullif(btrim(v_headers->>'cf-connecting-ip'), '');
  if v_ip_text is null then
    raise exception '无法验证请求来源，请通过官方网站重试' using errcode = '42501';
  end if;
  begin
    v_ip := v_ip_text::inet;
  exception when invalid_text_representation then
    raise exception '无法验证请求来源，请通过官方网站重试' using errcode = '42501';
  end;

  delete from maintenance_private.notify_subscription_attempts
  where attempted_at < now() - interval '1 day';

  perform pg_advisory_xact_lock(hashtext(v_ip::text));
  select count(*) into v_count
  from maintenance_private.notify_subscription_attempts
  where client_ip = v_ip and attempted_at > now() - interval '15 minutes';

  if v_count >= 20 then
    raise exception '登记过于频繁，请稍后再试' using errcode = 'P0001';
  end if;

  insert into maintenance_private.notify_subscription_attempts(client_ip) values (v_ip);
  return new;
end;
$fn$;

revoke all on function maintenance_private.enforce_notify_subscription_rate_limit() from public, anon, authenticated;

drop trigger if exists maintenance_notify_email_rate_limit on public.maintenance_notify_emails;
create trigger maintenance_notify_email_rate_limit
before insert on public.maintenance_notify_emails
for each row execute function maintenance_private.enforce_notify_subscription_rate_limit();

-- Clients may submit only the email column; ID and timestamp stay server-generated.
revoke insert on public.maintenance_notify_emails from public, anon, authenticated;
grant insert (email) on public.maintenance_notify_emails to anon, authenticated;

-- Normalize uniqueness regardless of email letter casing.
create unique index if not exists maintenance_notify_emails_email_lower_key
  on public.maintenance_notify_emails (lower(email));
