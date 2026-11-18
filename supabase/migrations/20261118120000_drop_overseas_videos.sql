-- 海外视频采集系统整体拆除：删掉 5 张 overseas 表（含其 RLS 策略）。
-- 用户 2026-11-18 两次确认全部取消，包括数据库里的视频。
-- 备份在先：~/workspace/goals/overseas-video-daily-harvest-system/files/backup-before-removal-2026-11-18.json
-- （overseas_videos 90 行、overseas_video_sources 9 行、overseas_video_categories 7 行、
--  overseas_harvest_runs 1 行、overseas_video_reviews 16 行）。
-- 只删这 5 张表，不碰其他任何表。旧迁移文件是历史记录，留着不动。

drop table if exists public.overseas_videos cascade;
drop table if exists public.overseas_video_sources cascade;
drop table if exists public.overseas_video_categories cascade;
drop table if exists public.overseas_harvest_runs cascade;
drop table if exists public.overseas_video_reviews cascade;
