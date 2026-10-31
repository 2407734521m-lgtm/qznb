-- 025_love_wall_media_comments
-- 表白墙升级：帖子可带多个附件（照片 <= 9、视频 <= 3，文件存现有 media 桶），并可评论。
-- 纯新增：两张新表 + media 桶单文件上限 10MB -> 50MB；不改动任何现有表与数据。
-- 回滚：drop table public.love_wall_comments; drop table public.love_wall_media;
--       update storage.buckets set file_size_limit = 10485760 where id = 'media';

create table public.love_wall_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.love_wall_posts(id) on delete cascade,
  path text not null,
  kind text not null check (kind in ('image', 'video')),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index love_wall_media_post_id_idx on public.love_wall_media (post_id);
alter table public.love_wall_media enable row level security;

-- 可见性跟随帖子：帖子已发布，或本人是作者，或是管理员
create policy love_wall_media_read on public.love_wall_media
  for select to authenticated
  using (exists (
    select 1 from public.love_wall_posts p
    where p.id = post_id
      and (p.status = 'published' or p.author_id = auth.uid() or my_role() in ('admin', 'super_admin'))
  ));
-- 只能给自己的帖子加附件
create policy love_wall_media_insert on public.love_wall_media
  for insert to authenticated
  with check (exists (
    select 1 from public.love_wall_posts p
    where p.id = post_id and p.author_id = auth.uid()
  ));
-- 作者或管理员可删附件行（删帖时外键级联自动清理）
create policy love_wall_media_delete on public.love_wall_media
  for delete to authenticated
  using (exists (
    select 1 from public.love_wall_posts p
    where p.id = post_id
      and (p.author_id = auth.uid() or my_role() in ('admin', 'super_admin'))
  ));

create table public.love_wall_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.love_wall_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index love_wall_comments_post_id_idx on public.love_wall_comments (post_id, created_at);
alter table public.love_wall_comments enable row level security;

-- 已发布帖子下的未删评论成员可读；管理员可读全部（用于处理问题评论）
create policy love_wall_comments_read on public.love_wall_comments
  for select to authenticated
  using (
    my_role() in ('admin', 'super_admin')
    or (deleted_at is null and exists (
      select 1 from public.love_wall_posts p
      where p.id = post_id and p.status = 'published'
    ))
  );
-- 入班成员可在已发布帖子下评论，作者必须是自己
create policy love_wall_comments_insert on public.love_wall_comments
  for insert to authenticated
  with check (
    author_id = auth.uid() and is_member()
    and exists (
      select 1 from public.love_wall_posts p
      where p.id = post_id and p.status = 'published'
    )
  );
-- 软删（写 deleted_at）走 update：仅评论作者或管理员
create policy love_wall_comments_update on public.love_wall_comments
  for update to authenticated
  using (author_id = auth.uid() or my_role() in ('admin', 'super_admin'))
  with check (author_id = auth.uid() or my_role() in ('admin', 'super_admin'));

-- media 桶单文件上限 10MB -> 50MB（否则稍大一点的视频根本传不上来；只影响 media 桶）
update storage.buckets set file_size_limit = 52428800 where id = 'media';
