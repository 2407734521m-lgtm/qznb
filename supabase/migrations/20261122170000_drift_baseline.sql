-- 20261122170000_drift_baseline.sql
-- 第 4 步漂移收敛：以下对象在生产库真实存在，但仓库迁移历史里缺失
-- （12 张表无 CREATE TABLE；clear_game_profile 无函数定义；
-- admin_broadcasts 缺 ab_ins/ab_upd、broadcast_receipts 的三条策略
-- 在仓库里完全没有）。本迁移全部写成幂等形式
-- （CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DO 块判重建策略 / CREATE OR REPLACE FUNCTION），在生产库上应为无操作
-- （no-op），只补齐仓库记录，让新环境仅靠迁移能重建出同样的结构。
-- 列、默认值、检查约束、外键、索引、策略表达式均按生产库
-- （2026-11-22 实测回读 information_schema / pg_constraint /
-- pg_indexes / pg_policies / pg_get_functiondef）照抄，不改任何现有
-- 行数据，不删任何对象，不改任何策略表达式，不新增 ab_del
-- （生产库本来就没有 ab_del，不在此补）。
-- 不在本迁移范围（另行定夺，不擅自改）：管理版发布历史缺 1.1
-- （admin_app_releases 只有 1.0，设置是 1.1，是否补录待用户定）；
-- 死后端（site_feature_enabled、admin_request_sensitive_action、
-- unhide_conversation、音乐下载版发布 RPC 等）只字不改；
-- 音乐下载版双轨版本源（静态 JSON vs public_musicdl_app_update）
-- 不在此二选一。
-- 回滚：直接删本迁移的记录即可，对象本身保留（生产库原本就有），
-- 无需回滚数据。
--
-- 残留：本迁移只补“缺失的对象”，不修历史迁移的引用顺序。更早的
-- 迁移（如 20261031160847、20261101013800 的聊天守卫、广播各迁移）
-- 在仓库时间线上先于本迁移就引用了这些表，全新环境按顺序重放
-- 仍会在那些迁移处失败——要彻底修好需改动历史迁移，不在本
-- 迁移范围；生产库不受影响。

-- 0) conversations：私信会话。
create table if not exists public.conversations (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  conversation_type text not null default 'direct',
  group_name text,
  group_avatar_path text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  disappearing_mode text not null default 'off',
  disappearing_seconds integer,
  disappearing_started_at timestamptz,
  constraint conversations_type_check check (conversation_type = any (array['direct'::text, 'group'::text])),
  constraint conversations_disappearing_mode_check check (disappearing_mode = any (array['off'::text, 'after_read'::text, 'timed'::text])),
  constraint conversations_disappearing_seconds_check check ((((disappearing_mode = 'timed'::text) and (disappearing_seconds is not null) and ((disappearing_seconds >= 30) and (disappearing_seconds <= 2592000))) or ((disappearing_mode <> 'timed'::text) and (disappearing_seconds is null))))
);
alter table public.conversations enable row level security;
create index if not exists conversations_type_updated_idx on public.conversations using btree (conversation_type, updated_at desc);

-- 1) messages：私信消息。
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  reply_to_id bigint references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  expires_at timestamptz,
  forwarded_from_message_id bigint references public.messages(id) on delete set null,
  forwarded_from_sender_id uuid references public.profiles(id) on delete set null,
  forwarded_from_name text,
  constraint messages_body_check check (char_length(body) <= 2000)
);
alter table public.messages enable row level security;
create index if not exists idx_messages_conversation_id_fk on public.messages using btree (conversation_id);
create index if not exists idx_messages_sender_id_fk on public.messages using btree (sender_id);
create index if not exists messages_conversation_id_id_desc_idx on public.messages using btree (conversation_id, id desc);
create index if not exists messages_expires_at_idx on public.messages using btree (expires_at) where ((expires_at is not null) and (deleted_at is null));
create index if not exists messages_forwarded_from_message_id_idx on public.messages using btree (forwarded_from_message_id);
create index if not exists messages_forwarded_from_sender_id_idx on public.messages using btree (forwarded_from_sender_id);
create index if not exists messages_reply_to_id_idx on public.messages using btree (reply_to_id);

-- 2) conversation_members：会话成员（含已读回执、壁纸、角色）。
create table if not exists public.conversation_members (
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_message_id bigint references public.messages(id) on delete set null,
  last_receipt_message_id bigint references public.messages(id) on delete set null,
  chat_background text not null default 'default',
  member_role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id),
  constraint conversation_members_role_check check (member_role = any (array['owner'::text, 'admin'::text, 'member'::text]))
);
alter table public.conversation_members enable row level security;
create index if not exists conversation_members_last_read_message_id_idx on public.conversation_members using btree (last_read_message_id);
create index if not exists conversation_members_last_receipt_message_id_idx on public.conversation_members using btree (last_receipt_message_id);
create index if not exists conversation_members_profile_conversation_idx on public.conversation_members using btree (profile_id, conversation_id);
create index if not exists idx_conversation_members_profile_id_fk on public.conversation_members using btree (profile_id);

-- 3) favorites：收藏（成员 / 动态）。
create table if not exists public.favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, target_type, target_id),
  constraint favorites_target_type_check check (target_type = any (array['member'::text, 'post'::text]))
);
alter table public.favorites enable row level security;

-- 4) feedbacks：反馈（联系开发者）。
create table if not exists public.feedbacks (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  name text,
  contact text,
  content text not null,
  kind text not null default 'general',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  admin_note text,
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  constraint feedbacks_admin_note_length_check check ((admin_note is null) or (char_length(admin_note) <= 500)),
  constraint feedbacks_contact_check check (char_length(contact) <= 100),
  constraint feedbacks_content_check check (char_length(content) <= 1000),
  constraint feedbacks_kind_check check (kind = any (array['general'::text, 'login'::text])),
  constraint feedbacks_name_check check (char_length(name) <= 30),
  constraint feedbacks_status_check check (status = any (array['open'::text, 'done'::text]))
);
alter table public.feedbacks enable row level security;
create index if not exists feedbacks_handled_by_idx on public.feedbacks using btree (handled_by);
create index if not exists idx_feedbacks_user on public.feedbacks using btree (user_id);

-- 5) friendships：好友关系。
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint friendships_check check (requester <> addressee),
  constraint friendships_requester_addressee_key unique (requester, addressee),
  constraint friendships_status_check check (status = any (array['pending'::text, 'accepted'::text, 'rejected'::text]))
);
alter table public.friendships enable row level security;
create index if not exists idx_friendships_addressee_fk on public.friendships using btree (addressee);

-- 6) game_profiles：游戏段位资料。
create table if not exists public.game_profiles (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  game_name text not null,
  game_uid text,
  rank text,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_profiles_profile_id_key unique (profile_id),
  constraint game_profiles_game_name_check check (char_length(game_name) <= 40),
  constraint game_profiles_game_uid_check check (char_length(game_uid) <= 60),
  constraint game_profiles_rank_check check (char_length(rank) <= 30),
  constraint game_profiles_status_check check (status = any (array['pending'::text, 'approved'::text, 'rejected'::text]))
);
alter table public.game_profiles enable row level security;
create index if not exists idx_game_profiles_reviewed_by_fk on public.game_profiles using btree (reviewed_by);

-- 7) invite_codes：邀请码。
create table if not exists public.invite_codes (
  id bigint generated always as identity primary key,
  code text not null,
  nickname text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint invite_codes_code_key unique (code),
  constraint invite_codes_code_check check (char_length(code) <= 40),
  constraint invite_codes_nickname_check check (char_length(nickname) <= 30)
);
alter table public.invite_codes enable row level security;
create index if not exists idx_invite_codes_created_by_fk on public.invite_codes using btree (created_by);

-- 8) notifications：通知（评论通知由 notify_post_author 写入）。
create table if not exists public.notifications (
  id bigint not null primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'comment',
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index if not exists notif_profile_idx on public.notifications using btree (profile_id, created_at desc);

-- 9) page_views：页面浏览计数。
create table if not exists public.page_views (
  page_key text not null primary key,
  views integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.page_views enable row level security;

-- 10) admin_broadcasts：管理后台广播。
create table if not exists public.admin_broadcasts (
  id bigint not null primary key,
  kind text not null,
  title text not null default '',
  body text not null default '',
  button_label text not null default '知道了',
  audience text not null default 'all',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  target_ids jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  poke_at timestamptz,
  poke_count integer not null default 0,
  poke_target_ids jsonb not null default '[]'::jsonb,
  image_url text,
  action_url text,
  action_label text not null default '查看详情',
  visual_style text not null default 'standard',
  max_impressions smallint not null default 1,
  repeat_interval_hours integer not null default 24,
  constraint admin_broadcasts_action_label_check check ((char_length(action_label) >= 1) and (char_length(action_label) <= 20)),
  constraint admin_broadcasts_action_url_check check ((action_url is null) or ((char_length(action_url) <= 300) and (left(action_url, 1) = '/'::text) and (left(action_url, 2) <> '//'::text))),
  constraint admin_broadcasts_audience_check check (audience = any (array['all'::text, 'app'::text, 'web'::text, 'selected'::text])),
  constraint admin_broadcasts_image_url_check check ((image_url is null) or ((char_length(image_url) <= 1000) and (image_url like 'https://%'::text))),
  constraint admin_broadcasts_kind_check check (kind = any (array['popup'::text, 'location'::text, 'vote'::text, 'form'::text, 'signup'::text, 'refresh'::text])),
  constraint admin_broadcasts_max_impressions_check check ((max_impressions >= 1) and (max_impressions <= 5)),
  constraint admin_broadcasts_repeat_interval_check check ((repeat_interval_hours >= 1) and (repeat_interval_hours <= 720)),
  constraint admin_broadcasts_visual_style_check check (visual_style = any (array['standard'::text, 'highlight'::text, 'compact'::text]))
);
alter table public.admin_broadcasts enable row level security;
create index if not exists admin_broadcasts_created_by_idx on public.admin_broadcasts using btree (created_by);

-- 11) broadcast_receipts：广播回执。
create table if not exists public.broadcast_receipts (
  broadcast_id bigint not null references public.admin_broadcasts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null,
  region text,
  updated_at timestamptz not null default now(),
  answer text,
  primary key (broadcast_id, user_id),
  constraint broadcast_receipts_status_check check (status = any (array['seen'::text, 'declined'::text, 'shared'::text, 'denied'::text, 'voted'::text, 'submitted'::text, 'joined'::text, 'not_joined'::text]))
);
alter table public.broadcast_receipts enable row level security;
create index if not exists broadcast_receipts_user_id_idx on public.broadcast_receipts using btree (user_id);

-- 12) 策略：按生产库 pg_policies 原样补齐，缺失才建（DO 块判重）。
-- ab_sel 在仓库 20261117002730 里已有，定义与生产一致，这里判重后跳过。
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_broadcasts' and policyname = 'ab_ins') then
    create policy ab_ins on public.admin_broadcasts for insert to authenticated
      with check (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_broadcasts' and policyname = 'ab_sel') then
    create policy ab_sel on public.admin_broadcasts for select to authenticated
      using ((coalesce(my_role(), ''::text) = any (array['admin'::text, 'super_admin'::text])));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_broadcasts' and policyname = 'ab_upd') then
    create policy ab_upd on public.admin_broadcasts for update to authenticated
      using (my_role() = any (array['admin'::text, 'super_admin'::text]))
      with check (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'broadcast_receipts' and policyname = 'br_ins') then
    create policy br_ins on public.broadcast_receipts for insert to authenticated
      with check (user_id = (select auth.uid() as uid));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'broadcast_receipts' and policyname = 'br_sel') then
    create policy br_sel on public.broadcast_receipts for select to authenticated
      using ((user_id = (select auth.uid() as uid)) or (my_role() = any (array['admin'::text, 'super_admin'::text])));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'broadcast_receipts' and policyname = 'br_upd') then
    create policy br_upd on public.broadcast_receipts for update to authenticated
      using (user_id = (select auth.uid() as uid))
      with check (user_id = (select auth.uid() as uid));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_members' and policyname = 'cm_sel') then
    create policy cm_sel on public.conversation_members for select to authenticated
      using (chat_private.is_conversation_member(conversation_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'c_sel') then
    create policy c_sel on public.conversations for select to authenticated
      using (chat_private.is_conversation_member(id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'favorites' and policyname = 'f_del') then
    create policy f_del on public.favorites for delete to authenticated
      using (profile_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'favorites' and policyname = 'f_ins') then
    create policy f_ins on public.favorites for insert to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'favorites' and policyname = 'f_sel') then
    create policy f_sel on public.favorites for select to authenticated
      using (profile_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedbacks' and policyname = 'fb_del') then
    create policy fb_del on public.feedbacks for delete to authenticated
      using (my_role() = 'super_admin'::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedbacks' and policyname = 'fb_ins') then
    create policy fb_ins on public.feedbacks for insert to anon, authenticated
      with check (not (user_id is distinct from (select auth.uid() as uid)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedbacks' and policyname = 'fb_sel') then
    create policy fb_sel on public.feedbacks for select to authenticated
      using (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feedbacks' and policyname = 'fb_sel_own') then
    create policy fb_sel_own on public.feedbacks for select to authenticated
      using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'friendships' and policyname = 'f_sel') then
    create policy f_sel on public.friendships for select to authenticated
      using ((is_member() and ((requester = (select auth.uid() as uid)) or (addressee = (select auth.uid() as uid)))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_profiles' and policyname = 'gp_admin') then
    create policy gp_admin on public.game_profiles for all to authenticated
      using (my_role() = any (array['admin'::text, 'super_admin'::text]))
      with check (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_profiles' and policyname = 'gp_sel') then
    create policy gp_sel on public.game_profiles for select to authenticated
      using ((profile_id = auth.uid()) or (my_role() = any (array['admin'::text, 'super_admin'::text])));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invite_codes' and policyname = 'ic_sel') then
    create policy ic_sel on public.invite_codes for select to authenticated
      using (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invite_codes' and policyname = 'ic_upd') then
    create policy ic_upd on public.invite_codes for update to authenticated
      using (my_role() = any (array['admin'::text, 'super_admin'::text]))
      with check (my_role() = any (array['admin'::text, 'super_admin'::text]));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'm_ins') then
    create policy m_ins on public.messages for insert to authenticated
      with check (((sender_id = (select auth.uid() as uid)) and chat_private.is_conversation_member(conversation_id) and site_feature_enabled('chat'::text) and ((reply_to_id is null) or (exists (select 1 from messages parent where ((parent.id = messages.reply_to_id) and (parent.conversation_id = messages.conversation_id)))))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'm_sel') then
    create policy m_sel on public.messages for select to authenticated
      using (chat_private.is_conversation_member(conversation_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'md_messages_insert_guard') then
    create policy md_messages_insert_guard on public.messages as restrictive for insert to authenticated
      with check (member_moderation_allows('chat'::text));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'nt_sel') then
    create policy nt_sel on public.notifications for select to authenticated
      using (auth.uid() = profile_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'nt_upd') then
    create policy nt_upd on public.notifications for update to authenticated
      using (auth.uid() = profile_id)
      with check (auth.uid() = profile_id);
  end if;
end $$;

-- 13) clear_game_profile：前端 MyProfile 在调、生产库有，仓库无定义。
-- 按生产 pg_get_functiondef 原样复写；只删本人 game_profiles 行。
create or replace function public.clear_game_profile()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.game_profiles where profile_id = auth.uid();
end $function$;
revoke all on function public.clear_game_profile() from public;
grant execute on function public.clear_game_profile() to authenticated;

