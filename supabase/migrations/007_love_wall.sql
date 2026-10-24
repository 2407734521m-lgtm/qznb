-- 007_love_wall.sql（加固版，未执行、未合并，仅供审阅）
-- 改动说明（相对 PR #14 原版 007）：
-- 1) love_wall_read 收紧：普通用户不再能直接查表读到别人的已发布帖子，
--    表的直接读取只允许作者本人（任意状态）或管理员；别人的已发布帖子
--    只能走下面的 love_wall_published() 函数读，且函数不返回 author_id。
-- 2) 新增 love_wall_published()：SECURITY DEFINER + search_path=''，
--    只返回 status='published' 的行，且输出列里没有 author_id、没有 updated_at。
--    未登录调用直接报错；EXECUTE 只给 authenticated，不给 anon。
-- 其余部分（建表、索引、插入策略、管理员更新策略、授权）与原版 007 完全一致。
-- Love wall: anonymous public display, identifiable to administrators only.
create table if not exists public.love_wall_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text,
  category text not null default '暗恋心事' check (category in ('暗恋心事','认真表白','感谢与祝福','毕业寄语')),
  content text not null check (char_length(content) between 2 and 500),
  is_anonymous boolean not null default true,
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists love_wall_posts_status_created_idx on public.love_wall_posts(status, created_at desc);
create index if not exists love_wall_posts_author_created_idx on public.love_wall_posts(author_id, created_at desc);
alter table public.love_wall_posts enable row level security;
drop policy if exists love_wall_read on public.love_wall_posts;
create policy love_wall_read on public.love_wall_posts for select to authenticated
using (author_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));
drop policy if exists love_wall_insert on public.love_wall_posts;
create policy love_wall_insert on public.love_wall_posts for insert to authenticated
with check (author_id = auth.uid() and status = 'pending');
drop policy if exists love_wall_admin_update on public.love_wall_posts;
create policy love_wall_admin_update on public.love_wall_posts for update to authenticated
using (public.my_role() in ('admin', 'super_admin'))
with check (public.my_role() in ('admin', 'super_admin'));
grant select, insert on public.love_wall_posts to authenticated;
grant update on public.love_wall_posts to authenticated;

-- 公开列表专用函数：普通用户读已发布帖子的唯一路径，不返回 author_id。
create or replace function public.love_wall_published()
returns table (
  id uuid,
  recipient_name text,
  category text,
  content text,
  is_anonymous boolean,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.recipient_name, p.category, p.content, p.is_anonymous, p.status, p.created_at
  from public.love_wall_posts p
  where auth.uid() is not null
    and p.status = 'published'
  order by p.created_at desc
  limit 100;
$function$;
revoke all on function public.love_wall_published() from public;
grant execute on function public.love_wall_published() to authenticated;
