-- 一键删除一个账号的全部帖子：仅超管可用，后台「账号管理」每位成员一行按钮。
--
-- 范围：动态（posts）+ 表白墙（love_wall_posts）+ 歌声墙（song_posts）。
-- 不动账号本身，不动评论、私信、时光胶囊、心愿、公告留言等其他内容；
-- 被删帖子下的评论 / 点赞 / 附件随数据库级联一并删除。
-- 前端先调 count_account_posts 展示数量、站内二次确认后，再调
-- delete_account_posts；两函数都在库内校验超管身份与目标角色，
-- 绕过前端也删不了管理员的帖子、删不了自己的帖子。

begin;

create or replace function public.count_account_posts(
  p_target uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_posts bigint;
  v_love bigint;
  v_songs bigint;
begin
  if v_actor is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;
  if p_target is null then
    raise exception 'invalid account';
  end if;

  select role into v_role from public.profiles where id = p_target;
  if not found then
    raise exception 'account not found';
  end if;
  if v_role <> 'member' then
    raise exception 'only member posts can be deleted this way';
  end if;

  select pg_catalog.count(*) into v_posts from public.posts where author_id = p_target;
  select pg_catalog.count(*) into v_love from public.love_wall_posts where author_id = p_target;
  select pg_catalog.count(*) into v_songs from public.song_posts where author_id = p_target;

  return pg_catalog.jsonb_build_object(
    'posts', v_posts,
    'love_wall_posts', v_love,
    'song_posts', v_songs,
    'total', v_posts + v_love + v_songs
  );
end;
$function$;

create or replace function public.delete_account_posts(
  p_target uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_posts bigint;
  v_love bigint;
  v_songs bigint;
begin
  if v_actor is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;
  if p_target is null then
    raise exception 'invalid account';
  end if;
  if p_target = v_actor then
    raise exception 'cannot delete your own posts this way';
  end if;

  select role into v_role from public.profiles where id = p_target for update;
  if not found then
    raise exception 'account not found';
  end if;
  if v_role <> 'member' then
    raise exception 'only member posts can be deleted this way';
  end if;

  delete from public.song_posts where author_id = p_target;
  get diagnostics v_songs = row_count;
  delete from public.love_wall_posts where author_id = p_target;
  get diagnostics v_love = row_count;
  delete from public.posts where author_id = p_target;
  get diagnostics v_posts = row_count;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'admin_delete_account_posts',
    p_target,
    pg_catalog.jsonb_build_object(
      'posts', v_posts,
      'love_wall_posts', v_love,
      'song_posts', v_songs
    )
  );

  return pg_catalog.jsonb_build_object(
    'posts', v_posts,
    'love_wall_posts', v_love,
    'song_posts', v_songs,
    'total', v_posts + v_love + v_songs
  );
end;
$function$;

revoke all on function public.count_account_posts(uuid) from public, anon;
grant execute on function public.count_account_posts(uuid) to authenticated;
revoke all on function public.delete_account_posts(uuid) from public, anon;
grant execute on function public.delete_account_posts(uuid) to authenticated;

commit;
