-- 20261121090000_audit_phase2_drift_convergence.sql
-- 第 2 阶段审计发现的仓库与生产库漂移收敛：以下对象在生产库真实存在，
-- 但仓库迁移历史里缺失（或定义已落后）。本迁移全部写成幂等形式
-- （IF NOT EXISTS / DO 块判重 / ON CONFLICT），在生产库上应为无操作
-- （no-op），只补齐仓库记录，让新环境仅靠迁移能重建出同样的结构。
-- 不改任何现有行数据，不删任何对象。回滚：直接删本迁移的记录即可，
-- 对象本身保留（生产库原本就有），无需回滚数据。

-- 1) reports 表：生产库存在（RLS 已开），仓库 123 个迁移里无建表。
--    列定义与生产库一致：id 为 GENERATED ALWAYS AS IDENTITY。
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  status text not null default 'pending',
  handled_by uuid,
  handle_note text,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'rp_ins') then
    create policy rp_ins on public.reports for insert to authenticated
      with check (auth.uid() = reporter_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'rp_sel') then
    create policy rp_sel on public.reports for select to authenticated
      using (auth.uid() = reporter_id or my_role() = any (array['admin', 'super_admin']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'rp_upd') then
    create policy rp_upd on public.reports for update to authenticated
      using (my_role() = any (array['admin', 'super_admin']))
      with check (my_role() = any (array['admin', 'super_admin']));
  end if;
end $$;

-- 2) comments 表 UPDATE 策略：生产库存在（comments_update_own /
--    md_comments_update_guard），仓库只有 c_sel / c_ins / c_del。
--    动态评论编辑（PostList saveComment）依赖这两条策略。
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_update_own') then
    create policy comments_update_own on public.comments for update to authenticated
      using (auth.uid() = author_id)
      with check (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'md_comments_update_guard') then
    create policy md_comments_update_guard on public.comments for update to authenticated
      using (member_moderation_allows('community'))
      with check (member_moderation_allows('community'));
  end if;
end $$;

-- 3) profiles.phone 列 UPDATE 授权：生产库 authenticated 可改 9 列（含 phone），
--    仓库 001_init.sql 只授 8 列。GRANT 本身幂等。
grant update (phone) on public.profiles to authenticated;

-- 4) profile_privacy.show_game_id / profile_contacts.game_id：
--    两列在生产库存在（show_game_id boolean NOT NULL DEFAULT true；
--    game_id text 可空），仓库迁移里找不到新增语句。
alter table public.profile_privacy
  add column if not exists show_game_id boolean not null default true;
alter table public.profile_contacts
  add column if not exists game_id text;

-- 5) chat-media 桶：前端放行视频/文档、上限 50MB，生产桶已是 50MB +
--    全白名单（图片/音频/视频/文档/压缩包），但仓库 006_chat_media.sql
--    仍是 15MB、仅图片+音频。按生产现状收敛（与 006 同款 upsert 写法）。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 52428800, array[
  'image/jpeg','image/png','image/webp','image/gif','image/heic','image/avif',
  'audio/webm','audio/mp4','audio/ogg','audio/aac','audio/mpeg','audio/x-m4a',
  'video/mp4','video/webm','video/quicktime','video/3gpp',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain','text/csv',
  'application/zip','application/x-zip-compressed',
  'application/vnd.rar','application/x-rar-compressed',
  'application/x-7z-compressed','application/octet-stream'
])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
