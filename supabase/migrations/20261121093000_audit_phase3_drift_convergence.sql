-- 20261121093000_audit_phase3_drift_convergence.sql
-- 第 3 阶段审计发现的仓库与生产库漂移收敛：以下对象在生产库真实存在，
-- 但仓库迁移历史里缺失（或定义已落后）。本迁移全部写成幂等形式
-- （CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- DO 块判重 / CREATE OR REPLACE FUNCTION），在生产库上应为无操作
-- （no-op），只补齐仓库记录，让新环境仅靠迁移能重建出同样的结构。
-- 不改任何现有行数据，不删任何对象，不改任何策略表达式
-- （tc_sel 保持生产现状：不含 open_at 门控，见 C 线 S1，另立方案）。
-- 回滚：直接删本迁移的记录即可，对象本身保留（生产库原本就有），
-- 无需回滚数据。
--
-- 残留：本迁移只补“缺失的对象”，不修历史迁移的引用顺序。更早的
-- 迁移（如 018 的 greetings_notify_recipient 触发器、
-- 20261031160847 的 bm_ins/g_ins、20261101013800 的 md_* 守卫）
-- 在仓库时间线上先于本迁移就引用了这些表，全新环境按顺序重放
-- 仍会在那些迁移处失败——要彻底修好需改动历史迁移，不在本
-- 迁移范围；生产库不受影响。

-- 0) albums.deleted_at 列：生产库存在（timestamptz，可空），仓库无任何迁移。
alter table public.albums
  add column if not exists deleted_at timestamptz;

-- 1) board_messages 表：生产库存在，仓库 124 个迁移里无建表、无 RLS。
--    列、默认值、检查约束、外键均与生产库一致（2026-11-21 实测回读）。
create table if not exists public.board_messages (
  id bigint generated always as identity primary key,
  author_id uuid references public.profiles(id) on delete cascade,
  content text not null,
  is_admin_msg boolean not null default false,
  created_at timestamptz not null default now(),
  is_pinned boolean not null default false,
  expires_at timestamptz,
  deleted_at timestamptz,
  popup_on_login boolean not null default false,
  title text,
  popup_times integer not null default 1,
  audience text not null default 'all',
  constraint board_messages_content_check check (char_length(content) >= 1 and char_length(content) <= 500),
  constraint board_messages_audience_check check (audience = any (array['all'::text, 'app'::text]))
);
alter table public.board_messages enable row level security;

-- 2) board_reads 表：生产库存在（profile_id 为主键），仓库迁移里零提及。
create table if not exists public.board_reads (
  profile_id uuid not null primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.board_reads enable row level security;

-- 3) events 表：生产库存在（7 列），仓库无建表。
create table if not exists public.events (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  event_at timestamptz,
  location text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;

-- 4) event_regs 表：生产库存在（复合主键），仓库无建表。
create table if not exists public.event_regs (
  event_id bigint not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
alter table public.event_regs enable row level security;

-- 5) wishes 表：生产库存在（5 列，含 likes），仓库无建表。
create table if not exists public.wishes (
  id bigint generated always as identity primary key,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null,
  likes integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.wishes enable row level security;

-- 6) greetings 表：生产库存在（6 列），仓库无建表。
--    通知触发器 greetings_notify_recipient 在 018 已定义，不在此重复。
create table if not exists public.greetings (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid references public.profiles(id) on delete set null,
  content text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint greetings_content_check check (char_length(content) >= 1 and char_length(content) <= 500)
);
alter table public.greetings enable row level security;

-- 7) time_capsules 表：生产库存在（8 列，open_at 为 date），仓库无建表。
create table if not exists public.time_capsules (
  id bigint generated always as identity primary key,
  author_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  open_at date not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.time_capsules enable row level security;

-- 8) hot_snippets 表：生产库存在（10 列），仓库无建表。
create table if not exists public.hot_snippets (
  id bigint generated always as identity primary key,
  title text not null,
  language text not null default '',
  code text not null,
  summary text not null default '',
  source_url text,
  source_name text not null default '',
  views integer not null default 0,
  window_views integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.hot_snippets enable row level security;

-- 9) RLS 策略：只补仓库里缺失的；仓库已有的
--    （bm_ins、g_ins、er_ins、er_sel、md_* 系列守卫、wishes_update_own）
--    表达式与生产一致，不在此重复。以下表达式均为生产库实测回读的原文。
do $$
begin
  -- board_messages：bm_ins 已在 20261031160847，md 守卫已在 20261101013800。
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'board_messages' and policyname = 'bm_del') then
    create policy bm_del on public.board_messages for delete to public
      using ((author_id = auth.uid()) or (my_role() = any (array['admin'::text, 'super_admin'::text])));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'board_messages' and policyname = 'bm_sel') then
    create policy bm_sel on public.board_messages for select to public
      using (is_member());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'board_messages' and policyname = 'bm_upd') then
    create policy bm_upd on public.board_messages for update to authenticated
      using (my_role() = any (array['admin'::text, 'super_admin'::text]))
      with check (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;

  -- board_reads：三条策略仓库里全缺。
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'board_reads' and policyname = 'br_ins') then
    create policy br_ins on public.board_reads for insert to authenticated
      with check (auth.uid() = profile_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'board_reads' and policyname = 'br_sel') then
    create policy br_sel on public.board_reads for select to authenticated
      using (auth.uid() = profile_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'board_reads' and policyname = 'br_upd') then
    create policy br_upd on public.board_reads for update to authenticated
      using (auth.uid() = profile_id)
      with check (auth.uid() = profile_id);
  end if;

  -- events：三条策略仓库里全缺。
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'e_del') then
    create policy e_del on public.events for delete to authenticated
      using (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'e_ins') then
    create policy e_ins on public.events for insert to authenticated
      with check (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'e_sel') then
    create policy e_sel on public.events for select to authenticated
      using (true);
  end if;

  -- event_regs：er_ins / er_sel 已在 20261031171814，只补 er_del。
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_regs' and policyname = 'er_del') then
    create policy er_del on public.event_regs for delete to authenticated
      using (auth.uid() = profile_id);
  end if;

  -- wishes：md 守卫与 wishes_update_own 已在仓库，只补 w_del / w_ins / w_sel。
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishes' and policyname = 'w_del') then
    create policy w_del on public.wishes for delete to authenticated
      using ((auth.uid() = author_id) or (my_role() = any (array['admin'::text, 'super_admin'::text])));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishes' and policyname = 'w_ins') then
    create policy w_ins on public.wishes for insert to authenticated
      with check (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishes' and policyname = 'w_sel') then
    create policy w_sel on public.wishes for select to authenticated
      using (true);
  end if;

  -- greetings：g_ins 与 md 守卫已在仓库，只补 g_del / g_sel / g_upd_admin。
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'greetings' and policyname = 'g_del') then
    create policy g_del on public.greetings for delete to authenticated
      using ((author_id = auth.uid()) or (my_role() = any (array['admin'::text, 'super_admin'::text])));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'greetings' and policyname = 'g_sel') then
    create policy g_sel on public.greetings for select to authenticated
      using (deleted_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'greetings' and policyname = 'g_upd_admin') then
    create policy g_upd_admin on public.greetings for update to authenticated
      using (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;

  -- time_capsules：四条策略仓库里全缺。注意 tc_sel 保持生产现状
  -- （无 open_at 门控，未开启公开胶囊直连 API 可读，见 C 线 S1），
  -- 本迁移不改它，正确修法需另立 RPC 方案。
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_capsules' and policyname = 'tc_del') then
    create policy tc_del on public.time_capsules for delete to authenticated
      using (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_capsules' and policyname = 'tc_ins') then
    create policy tc_ins on public.time_capsules for insert to authenticated
      with check (auth.uid() = author_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_capsules' and policyname = 'tc_sel') then
    create policy tc_sel on public.time_capsules for select to authenticated
      using ((is_public = true) or (auth.uid() = author_id) or (my_role() = any (array['admin'::text, 'super_admin'::text])));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_capsules' and policyname = 'tc_upd_deleted_at') then
    create policy tc_upd_deleted_at on public.time_capsules for update to authenticated
      using (auth.uid() = author_id)
      with check (auth.uid() = author_id);
  end if;

  -- hot_snippets：仅一条 select 策略，仓库里缺失。
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hot_snippets' and policyname = 'hot_snippets_sel') then
    create policy hot_snippets_sel on public.hot_snippets for select to authenticated
      using (true);
  end if;

  -- song-audio 桶删除策略：作者可删自己任何投稿的音频。仓库 027 只有
  -- song_audio_delete_own_pending（仅 pending 可删），生产库多出这一条。
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'song_audio_delete_own_submission') then
    create policy song_audio_delete_own_submission on storage.objects for delete to authenticated
      using ((bucket_id = 'song-audio'::text) and (exists (select 1 from public.song_posts s where ((s.audio_path = objects.name) and (s.author_id = (select auth.uid() as uid))))));
  end if;
end $$;

-- 10) bump_hot_snippet_view 函数：生产库存在，仓库 016 只有 revoke/grant，
--     无函数定义。定义原文为生产库实测回读（SECURITY DEFINER，search_path public）。
create or replace function public.bump_hot_snippet_view(p_id bigint)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.hot_snippets
  set views = views + 1, window_views = window_views + 1
  where id = p_id and auth.uid() is not null;
$function$;
grant execute on function public.bump_hot_snippet_view(bigint) to authenticated;
