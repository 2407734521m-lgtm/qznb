-- 037_daily_board_section
-- 日常板块：给 posts 加 section 区分「动态 feed / 日常 daily」。
-- 存量帖子默认归 feed，动态页行为不变；日常帖子与动态共用评论/点赞/举报/管理员软删与回收站。
-- 回滚：drop index posts_section_created_idx; alter table posts drop constraint posts_section_check; alter table posts drop column section;
--   注意回滚会丢掉日常帖子的板块区分（帖子本体保留），已有日常帖子时不要回滚本迁移。

alter table public.posts
  add column if not exists section text not null default 'feed';

alter table public.posts
  drop constraint if exists posts_section_check;

alter table public.posts
  add constraint posts_section_check check (section in ('feed', 'daily'));

create index if not exists posts_section_created_idx
  on public.posts (section, created_at desc)
  where deleted_at is null;
