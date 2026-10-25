-- 016_member_data_rpc_privacy.sql
-- Keep private class-member RPCs authenticated and honor per-member game-ID privacy.
begin;

-- These RPCs operate on private member data or modify authenticated users' data.
revoke execute on function public.bump_hot_snippet_view(bigint) from public, anon;
grant execute on function public.bump_hot_snippet_view(bigint) to authenticated, service_role;
revoke execute on function public.clear_game_profile() from public, anon;
grant execute on function public.clear_game_profile() to authenticated, service_role;
revoke execute on function public.friend_requests() from public, anon;
grant execute on function public.friend_requests() to authenticated, service_role;
revoke execute on function public.get_or_create_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated, service_role;
revoke execute on function public.is_conversation_member(bigint) from public, anon;
grant execute on function public.is_conversation_member(bigint) to authenticated, service_role;
revoke execute on function public.join_class(text) from public, anon;
grant execute on function public.join_class(text) to authenticated, service_role;
revoke execute on function public.member_detail(uuid) from public, anon;
grant execute on function public.member_detail(uuid) to authenticated, service_role;
revoke execute on function public.member_directory(text,integer,integer) from public, anon;
grant execute on function public.member_directory(text,integer,integer) to authenticated, service_role;
revoke execute on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated, service_role;
revoke execute on function public.respond_friend_request(uuid,boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid,boolean) to authenticated, service_role;
revoke execute on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated, service_role;
revoke execute on function public.submit_game_profile(text,text,text) from public, anon;
grant execute on function public.submit_game_profile(text,text,text) to authenticated, service_role;
revoke execute on function public.member_video(uuid) from public, anon;
grant execute on function public.member_video(uuid) to authenticated, service_role;
revoke execute on function public.game_badges() from public, anon;
grant execute on function public.game_badges() to authenticated, service_role;

-- This is an auth.users trigger function, not a client-callable RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;

-- The previous function returned every approved game UID regardless of class
-- membership and ignored profile_privacy.show_game_id.
create or replace function public.game_badges()
returns table(profile_id uuid, game_name text, game_uid text, rank text)
language sql
stable
security definer
set search_path to ''
as $function$
  select gp.profile_id,
         gp.game_name,
         case
           when coalesce(pr.show_game_id, false)
             or gp.profile_id = auth.uid()
             or coalesce(public.my_role(), '') in ('admin', 'super_admin')
           then gp.game_uid
           else null
         end as game_uid,
         gp.rank
  from public.game_profiles gp
  left join public.profile_privacy pr on pr.profile_id = gp.profile_id
  where public.is_member()
    and gp.status = 'approved'
    and gp.rank is not null;
$function$;

-- Approved introduction videos are still limited to joined members; private
-- video object paths are no longer discoverable by anonymous callers.
create or replace function public.member_video(uid uuid)
returns table(path text, status text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
  select p.intro_video_path, p.intro_video_status
  from public.profiles p
  where p.id = uid
    and p.intro_video_path is not null
    and (p.id = auth.uid()
         or (public.is_member() and p.intro_video_status = 'approved'));
end;
$function$;

commit;
