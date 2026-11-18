-- 海外视频每日采集系统 · 第 2 步：多来源 + 统一结构 + 播放检测
-- 只加字段、加枚举值，不动现有数据、不改 RLS、不删任何东西。
-- 幂等：字段用 add column if not exists；约束用“按定义文本删旧约束再加新约束”，
--   不依赖 20261117124000 里内联 check 约束的自动命名（<表>_<列>_check），重跑也安全。
-- 播放异常不用 status 承载：status 只留审核语义，本次只加 'license_pending'（授权待确认）；
--   播放问题记在新字段 playback_status（unchecked / playable / failed / unsupported）。
-- 许可证收紧说明：YouTube 官方嵌入不再写 'embed_allowed'，改写 'youtube_embed'；
--   'embed_allowed' 旧值保留在约束里（历史 90 条仍是该值，不改数据）。
-- 执行前请按项目定规先检查、备份、经确认再动手；本文件只写不执行。

-- 1) overseas_videos 加字段：直链、署名、播放检测状态与检测时间
alter table public.overseas_videos
  add column if not exists file_url text not null default '',
  add column if not exists attribution text not null default '',
  add column if not exists playback_status text not null default 'unchecked',
  add column if not exists playback_checked_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'overseas_videos_playback_status_check') then
    alter table public.overseas_videos
      add constraint overseas_videos_playback_status_check
      check (playback_status in ('unchecked', 'playable', 'failed', 'unsupported'));
  end if;
end $$;

-- 2) 放宽 platform check（两个表）：加 wikimedia / nasa / peertube，保留原有值
--    youtube / pexels / pixabay / openverse / archive
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.overseas_video_sources'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%platform%'
  loop
    execute format('alter table public.overseas_video_sources drop constraint %I', r.conname);
  end loop;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.overseas_videos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%platform%'
  loop
    execute format('alter table public.overseas_videos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.overseas_video_sources
  add constraint overseas_video_sources_platform_check
  check (platform in ('youtube', 'pexels', 'pixabay', 'openverse', 'archive', 'wikimedia', 'nasa', 'peertube'));
alter table public.overseas_videos
  add constraint overseas_videos_platform_check
  check (platform in ('youtube', 'pexels', 'pixabay', 'openverse', 'archive', 'wikimedia', 'nasa', 'peertube'));

-- 3) status 加 'license_pending'（授权待确认）；播放异常不进 status，见文件头说明
--    原值保留：pending_review / approved / rejected / published / archived
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.overseas_videos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
      and pg_get_constraintdef(oid) like '%pending_review%'
  loop
    execute format('alter table public.overseas_videos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.overseas_videos
  add constraint overseas_videos_status_check
  check (status in ('pending_review', 'approved', 'rejected', 'published', 'archived', 'license_pending'));

-- 4) license_type 补值：保留已有值（unknown / embed_allowed / cc0 / cc_by / cc_by_sa /
--    pexels / pixabay / licensed / rejected），补 youtube_embed、public_domain、nasa_public_domain。
--    cc0 已在原约束里，不重复补。
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.overseas_videos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%license_type%'
  loop
    execute format('alter table public.overseas_videos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.overseas_videos
  add constraint overseas_videos_license_type_check
  check (license_type in ('unknown', 'embed_allowed', 'cc0', 'cc_by', 'cc_by_sa', 'pexels', 'pixabay', 'licensed', 'rejected', 'youtube_embed', 'public_domain', 'nasa_public_domain'));

-- 5) 播放检测状态索引（后台按 playback_status 筛选用）
create index if not exists idx_ov_playback_status on public.overseas_videos (playback_status);
