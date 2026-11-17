-- 海外视频每日采集系统 · 第 1 步：建表 + RLS + 去重
-- 复用现有约定：my_role() = any (array['admin','super_admin']) 判管理员，
-- 与 music_download_logs 等表一致；采集器走 service_role 写库（绕过 RLS），
-- 前台匿名只能读 status='published' 的行。
-- 幂等：表、策略、种子均用 if not exists / on conflict，可重跑。
-- 不下载、不转载视频文件；YouTube 一律官方嵌入，CC 素材才允许下载链接。

-- 1) 内容分类
create table if not exists public.overseas_video_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  slug text not null unique,
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.overseas_video_categories enable row level security;
drop policy if exists ovc_sel_all on public.overseas_video_categories;
create policy ovc_sel_all on public.overseas_video_categories
  for select to anon, authenticated using (true);
drop policy if exists ovc_write_admin on public.overseas_video_categories;
create policy ovc_write_admin on public.overseas_video_categories
  for all to authenticated
  using (my_role() = any (array['admin', 'super_admin']))
  with check (my_role() = any (array['admin', 'super_admin']));

insert into public.overseas_video_categories (name, slug, sort_order) values
  ('英语学习', 'english', 10),
  ('科普', 'science', 20),
  ('纪录片', 'documentary', 30),
  ('校园生活', 'campus', 40),
  ('音乐', 'music', 50),
  ('运动', 'sports', 60),
  ('科技', 'tech', 70)
on conflict (slug) do nothing;

-- 2) 来源平台管理
create table if not exists public.overseas_video_sources (
  id bigint generated always as identity primary key,
  platform text not null check (platform in ('youtube', 'pexels', 'pixabay', 'openverse', 'archive')),
  source_type text not null check (source_type in ('channel', 'search', 'playlist')),
  external_id text not null default '',
  name text not null default '',
  url text not null default '',
  language text not null default 'en',
  category_id bigint references public.overseas_video_categories(id) on delete set null,
  enabled boolean not null default false,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.overseas_video_sources enable row level security;
drop policy if exists ovs_sel_admin on public.overseas_video_sources;
create policy ovs_sel_admin on public.overseas_video_sources
  for select to authenticated
  using (my_role() = any (array['admin', 'super_admin']));
drop policy if exists ovs_write_admin on public.overseas_video_sources;
create policy ovs_write_admin on public.overseas_video_sources
  for all to authenticated
  using (my_role() = any (array['admin', 'super_admin']))
  with check (my_role() = any (array['admin', 'super_admin']));

-- 首批来源先全部停用，等管理员在后台启用。
-- 下面 6 个 YouTube 频道 ID 均已用 RSS 实测核对过标题（2026-11-17），不是猜的；
-- 其中 Kurzgesagt 的正确 ID 末尾是 8Q，网上的旧写法少一位，已按实测为准。
-- 注意：Openverse 只有图片和音频、没有视频，不做视频源；
-- 免 Key 能直接跑的是 Archive.org（公共领域视频），YouTube RSS 需填频道 ID，
-- YouTube 搜索与 Pexels 搜索需各自的免费 API Key。
insert into public.overseas_video_sources (platform, source_type, external_id, name, url, language, category_id, enabled) values
  ('archive', 'search', 'nature documentary', 'Archive.org · 自然纪录片搜索（免 Key）', 'https://archive.org/advancedsearch.php', 'en', (select id from public.overseas_video_categories where slug = 'documentary'), false),
  ('pexels', 'search', 'english learning', 'Pexels · 英语学习搜索（需免费 Key）', 'https://api.pexels.com/videos/search', 'en', (select id from public.overseas_video_categories where slug = 'english'), false),
  ('youtube', 'search', 'TED-Ed science', 'YouTube · 搜索 TED-Ed 科普（需 Data API Key）', 'https://www.youtube.com/', 'en', (select id from public.overseas_video_categories where slug = 'science'), false),
  ('youtube', 'channel', 'UCsooa4yRKGN_zEE8iknghZA', 'YouTube · TED-Ed 频道 RSS（免 Key，已实测返回 TED-Ed）', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsooa4yRKGN_zEE8iknghZA', 'en', (select id from public.overseas_video_categories where slug = 'science'), false),
  ('youtube', 'channel', 'UCsXVk37bltHxD1rDPwtNM8Q', 'YouTube · Kurzgesagt – In a Nutshell 频道 RSS（免 Key，已实测，15 条）', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q', 'en', (select id from public.overseas_video_categories where slug = 'science'), false),
  ('youtube', 'channel', 'UCX6b17PVsYBQ0ip5gyeme-Q', 'YouTube · CrashCourse 频道 RSS（免 Key，已实测，15 条）', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCX6b17PVsYBQ0ip5gyeme-Q', 'en', (select id from public.overseas_video_categories where slug = 'science'), false),
  ('youtube', 'channel', 'UCHaHD477h-FeBbVh9Sh7syA', 'YouTube · BBC Learning English 频道 RSS（免 Key，已实测，15 条）', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHaHD477h-FeBbVh9Sh7syA', 'en', (select id from public.overseas_video_categories where slug = 'english'), false),
  ('youtube', 'channel', 'UCpVm7bg6pXKo1Pr6k5kxG9A', 'YouTube · National Geographic 频道 RSS（免 Key，已实测，15 条）', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCpVm7bg6pXKo1Pr6k5kxG9A', 'en', (select id from public.overseas_video_categories where slug = 'documentary'), false),
  ('youtube', 'channel', 'UCHnyfMqiRRG1u-2MsSQLbXA', 'YouTube · Veritasium 频道 RSS（免 Key，已实测，15 条）', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA', 'en', (select id from public.overseas_video_categories where slug = 'science'), false)
on conflict do nothing;

-- 3) 视频主表：只存元数据 + 嵌入链接，不存视频文件
create table if not exists public.overseas_videos (
  id bigint generated always as identity primary key,
  platform text not null check (platform in ('youtube', 'pexels', 'pixabay', 'openverse', 'archive')),
  external_video_id text not null,
  source_id bigint references public.overseas_video_sources(id) on delete set null,
  category_id bigint references public.overseas_video_categories(id) on delete set null,
  title text not null default '',
  author text not null default '',
  author_url text not null default '',
  original_url text not null default '',
  embed_url text not null default '',
  thumbnail_url text not null default '',
  published_at timestamptz,
  language text not null default 'en',
  duration_seconds int,
  width int,
  height int,
  view_count bigint,
  description text not null default '',
  license_type text not null default 'unknown' check (license_type in ('unknown', 'embed_allowed', 'cc0', 'cc_by', 'cc_by_sa', 'pexels', 'pixabay', 'licensed', 'rejected')),
  license_url text not null default '',
  copyright_status text not null default 'unknown' check (copyright_status in ('unknown', 'verified', 'rejected')),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'published', 'archived')),
  quality_score int not null default 0,
  content_hash text not null default '',
  duplicate_of bigint references public.overseas_videos(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_video_id)
);
alter table public.overseas_videos enable row level security;
drop policy if exists ov_sel_published on public.overseas_videos;
create policy ov_sel_published on public.overseas_videos
  for select to anon, authenticated
  using (status = 'published');
drop policy if exists ov_sel_admin on public.overseas_videos;
create policy ov_sel_admin on public.overseas_videos
  for select to authenticated
  using (my_role() = any (array['admin', 'super_admin']));
drop policy if exists ov_write_admin on public.overseas_videos;
create policy ov_write_admin on public.overseas_videos
  for all to authenticated
  using (my_role() = any (array['admin', 'super_admin']))
  with check (my_role() = any (array['admin', 'super_admin']));

create index if not exists idx_ov_status_published_at on public.overseas_videos (status, published_at desc);
create index if not exists idx_ov_content_hash on public.overseas_videos (content_hash);
create index if not exists idx_ov_source_id on public.overseas_videos (source_id);
create index if not exists idx_ov_category_id on public.overseas_videos (category_id);

-- 4) 每日采集记录
create table if not exists public.overseas_harvest_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  sources_checked int not null default 0,
  found_count int not null default 0,
  new_count int not null default 0,
  duplicate_count int not null default 0,
  failed_count int not null default 0,
  error text not null default '',
  log text not null default ''
);
alter table public.overseas_harvest_runs enable row level security;
drop policy if exists ohr_sel_admin on public.overseas_harvest_runs;
create policy ohr_sel_admin on public.overseas_harvest_runs
  for select to authenticated
  using (my_role() = any (array['admin', 'super_admin']));
drop policy if exists ohr_write_admin on public.overseas_harvest_runs;
create policy ohr_write_admin on public.overseas_harvest_runs
  for all to authenticated
  using (my_role() = any (array['admin', 'super_admin']))
  with check (my_role() = any (array['admin', 'super_admin']));

-- 5) 审核记录
create table if not exists public.overseas_video_reviews (
  id bigint generated always as identity primary key,
  video_id bigint not null references public.overseas_videos(id) on delete cascade,
  reviewer uuid,
  decision text not null check (decision in ('approved', 'rejected', 'published', 'archived')),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.overseas_video_reviews enable row level security;
drop policy if exists ovr_sel_admin on public.overseas_video_reviews;
create policy ovr_sel_admin on public.overseas_video_reviews
  for select to authenticated
  using (my_role() = any (array['admin', 'super_admin']));
drop policy if exists ovr_write_admin on public.overseas_video_reviews;
create policy ovr_write_admin on public.overseas_video_reviews
  for all to authenticated
  using (my_role() = any (array['admin', 'super_admin']))
  with check (my_role() = any (array['admin', 'super_admin']));
create index if not exists idx_ovr_video_id on public.overseas_video_reviews (video_id);
