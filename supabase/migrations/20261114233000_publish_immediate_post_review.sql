-- 先发后审：所有投稿类内容点发布即直接展示，巡查在发布后复核。
-- 改动范围（投稿类）：表白墙、段位。
-- 本来就是立即发的，不动：歌声墙（insert 时已是 published）、动态/日常 posts（无 status 字段，直接发布）。
-- 不动：好友申请、删号/改角色审批（仍先审后批）。
--
-- 1) 表白墙：前端 insert 改成 status='published'，但旧 RLS love_wall_insert
--    只放行 status='pending'，不改这条策略前端会直接被 RLS 拦下发布失败。
--    改为放行 pending 与 published 两种，旧待审数据不受影响。
-- 2) 段位：submit_game_profile 原来写 status='pending'（insert 与 on conflict
--    更新两处），改为 'approved'，提交后段位徽章立即显示，巡查事后复核。
-- 回滚：把策略改回 status='pending'、把函数两处 'approved' 改回 'pending' 即可。

drop policy if exists love_wall_insert on public.love_wall_posts;
create policy love_wall_insert on public.love_wall_posts for insert to authenticated
with check (author_id = (select auth.uid()) and status in ('pending', 'published') and recipient_notified_at is null and public.site_feature_enabled('love_wall'));

create or replace function public.submit_game_profile(gname text, guid text, rnk text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if gname is null or trim(gname) = '' then raise exception 'game required'; end if;
  insert into public.game_profiles (profile_id, game_name, game_uid, rank, status, reviewed_by, updated_at)
    values (auth.uid(), trim(gname), nullif(trim(coalesce(guid, '')), ''), nullif(trim(coalesce(rnk, '')), ''), 'approved', null, now())
    on conflict (profile_id) do update set
      game_name = excluded.game_name, game_uid = excluded.game_uid, rank = excluded.rank,
      status = 'approved', reviewed_by = null, updated_at = now();
end
$function$;
