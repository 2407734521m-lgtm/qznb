-- 008_love_wall_profile_hide_name.sql（未执行，仅供审阅；配合分支 feature/love-wall-profile-hide-name）
-- 目的：把表白墙匿名控制从“每次投稿单独选”改为“个人设置控制新帖子”，历史帖子保持原样（方案 A）。
-- 1) profile_privacy 新增 hide_love_wall_name，默认 true（默认隐藏，与现有默认匿名一致）。
--    已有用户的行会自动填 true，无需补数据；新用户的行由注册触发器建行时同样取默认值。
--    注意：该字段不以 show_ 开头，个人中心保存逻辑已同步改为包含它，否则开关存不进去。
-- 2) love_wall_published() 改版：仍只返回已发布帖子，仍不返回 author_id，仍不返回真实姓名。
--    新增 author_display_name：帖子不匿名时取 profiles.display_name（为空、只有空白时回退到 username），匿名时为 NULL。
--    该函数是 SECURITY DEFINER，因此能读到 display_name；这里用 love-wall 自己的隐藏设置决定是否展示，
--    不受 profile_privacy.show_name（个人档案名字显示）影响，两者是不同场景，不混用。
-- 3) 返回类型变更处理（关键）：线上旧函数返回 7 列，新函数返回 8 列（多 author_display_name）。
--    PostgreSQL 不允许用 CREATE OR REPLACE 直接改返回类型，会报错；因此必须先 DROP 再 CREATE。
--    依赖核查（执行前已查，见审查说明）：pg_depend 无依赖对象，其他函数体、视图定义、RLS 策略均未引用该函数，
--    唯一调用方是前端 LoveWall.tsx 的 rpc 调用（非数据库对象），故 DROP 不会级联影响其他数据库对象。
--    为避免 DROP 成功、CREATE 失败之间出现函数缺失的窗口，整份迁移包在 BEGIN/COMMIT 事务里执行。
-- 4) 授权：DROP 会清除旧函数的授权，因此重建后必须重新授权；顺序是先 GRANT 给 authenticated，
--    最后再 REVOKE anon（库里有默认授权会给新函数自动授 anon，必须显式撤掉，且撤权要放在最后一步）。
--    表、RLS 策略、管理员逻辑均不动。
begin;

alter table public.profile_privacy
  add column if not exists hide_love_wall_name boolean not null default true;

drop function if exists public.love_wall_published();

create function public.love_wall_published()
returns table (
  id uuid,
  recipient_name text,
  category text,
  content text,
  is_anonymous boolean,
  author_display_name text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.recipient_name, p.category, p.content, p.is_anonymous,
    case when p.is_anonymous then null
      else coalesce(nullif(btrim(pr.display_name), ''), pr.username::text)::text end,
    p.status, p.created_at
  from public.love_wall_posts p
  left join public.profiles pr on pr.id = p.author_id
  where auth.uid() is not null
    and p.status = 'published'
  order by p.created_at desc
  limit 100;
$function$;

grant execute on function public.love_wall_published() to authenticated;
revoke execute on function public.love_wall_published() from anon;

commit;
