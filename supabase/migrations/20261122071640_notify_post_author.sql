-- R2：评论通知写不进去。notifications 表自 018 起禁客户端直插（生产库只有 nt_sel / nt_upd），
-- PostList 评论后直插必被 RLS 拒绝，且调用处 .then(()=>{}) 把错误吞了。
-- 不补 nt_ins（那会推翻 018 的收紧：任一成员可给任意人插任意通知），改用服务端 RPC：
-- 调用方须已在该帖下留过言，服务端校验帖子/评论存在、排除自评、按隐私开关解析评论者名字后再插。
-- 参照：018 notify_greeting_recipient（服务端解析名字）、20261121110000 log_music_download（SECURITY DEFINER + set search_path = '' + 显式授权）。
begin;

create or replace function public.notify_post_author(
  p_post_id bigint,
  p_title text,
  p_link text,
  p_body text
) returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_post_author uuid;
  v_post_section text;
  v_commenter_name text;
  v_notification_id bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_body is null or pg_catalog.char_length(p_body) < 1 or pg_catalog.char_length(p_body) > 60 then
    raise exception 'invalid notification payload' using errcode = '22023';
  end if;

  select author_id, section into v_post_author, v_post_section
  from public.posts
  where id = p_post_id and deleted_at is null;
  if v_post_author is null then
    raise exception 'post not found' using errcode = '02000';
  end if;

  -- 标题/链接必须与帖子实际分区一致，不接受任意文本，避免借通知塞任意跳转。
  if (v_post_section = 'feed' and (p_title <> '有人评论了你的动态' or p_link <> '/feed'))
    or (v_post_section = 'daily' and (p_title not in ('有人评论了你的日常', '有人评论了你的帖子') or p_link <> '/daily'))
    or (v_post_section not in ('feed', 'daily')) then
    raise exception 'invalid notification payload' using errcode = '22023';
  end if;

  -- 自己评论自己不发通知。
  if v_post_author = auth.uid() then
    return null;
  end if;

  -- 调用方必须确实在该帖下留过言（评论行已先由调用方写入），否则不发。
  if not exists (
    select 1 from public.comments
    where post_id = p_post_id and author_id = auth.uid() and deleted_at is null
  ) then
    raise exception 'comment not found' using errcode = '02000';
  end if;

  -- 评论者名字由服务端解析（隐私开关关掉时只剩 username），不信任客户端传来的名字。
  select coalesce(nullif(p.display_name, ''), p.username::text, '同学')
    into v_commenter_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.notifications (profile_id, type, title, body, link)
  values (
    v_post_author,
    'comment',
    p_title,
    pg_catalog.left(coalesce(v_commenter_name, '同学') || '：' || p_body, 200),
    p_link
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$function$;

revoke all on function public.notify_post_author(bigint, text, text, text)
  from public, anon;
grant execute on function public.notify_post_author(bigint, text, text, text)
  to authenticated;

commit;
