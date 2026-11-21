-- This RPC is only meaningful for a signed-in requester; it has no guest use.
-- Remove the inherited public/anon EXECUTE path and keep authenticated access.
-- Use an empty search_path and fully qualify the existing table references.

begin;

create or replace function public.withdraw_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me uuid := auth.uid();
  affected integer;
begin
  if me is null then
    raise exception 'not logged in' using errcode = '42501';
  end if;

  delete from public.friendships
   where requester = me
     and addressee = target
     and status = 'pending';

  get diagnostics affected = row_count;
  if affected = 0 then
    return 'not_pending';
  end if;

  delete from public.notifications
   where profile_id = target
     and type = 'friend_request'
     and link = '/friends?tab=reqs&request=' || me::text;

  return 'withdrawn';
end;
$function$;

revoke all on function public.withdraw_friend_request(uuid) from public, anon;
grant execute on function public.withdraw_friend_request(uuid) to authenticated;

commit;
