-- 018_tighten_rpc_and_notification_writes.sql
-- Keep role/member checks callable by signed-in members only.
-- Greeting notifications are created by a trusted database trigger, not by client inserts.
begin;

revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated, service_role;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated, service_role;

drop policy if exists nt_ins on public.notifications;
revoke insert on table public.notifications from anon, authenticated;

create or replace function public.notify_greeting_recipient()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text;
begin
  if new.target_id is null or new.target_id = new.author_id then
    return new;
  end if;

  select coalesce(nullif(p.display_name, ''), p.username::text, '同学')
    into v_name
  from public.profiles p
  where p.id = new.author_id;

  insert into public.notifications (profile_id, type, title, body, link)
  values (
    new.target_id,
    'greeting',
    '有人给你留了言',
    left(coalesce(v_name, '同学') || '：' || left(coalesce(new.content, ''), 60), 100),
    '/greetings'
  );

  return new;
end;
$function$;

revoke execute on function public.notify_greeting_recipient() from public, anon, authenticated, service_role;

drop trigger if exists greetings_notify_recipient on public.greetings;
create trigger greetings_notify_recipient
after insert on public.greetings
for each row execute function public.notify_greeting_recipient();

commit;
