-- Add indexes for foreign-key columns flagged by Supabase's performance advisor.
-- Non-destructive: creates indexes only when absent; does not change rows or policies.
begin;
create index if not exists idx_album_photos_album_id_fk on public.album_photos (album_id);
create index if not exists idx_album_photos_uploaded_by_fk on public.album_photos (uploaded_by);
create index if not exists idx_albums_created_by_fk on public.albums (created_by);
create index if not exists idx_backup_logs_created_by_fk on public.backup_logs (created_by);
create index if not exists idx_board_messages_author_id_fk on public.board_messages (author_id);
create index if not exists idx_comments_author_id_fk on public.comments (author_id);
create index if not exists idx_comments_post_id_fk on public.comments (post_id);
create index if not exists idx_conversation_members_profile_id_fk on public.conversation_members (profile_id);
create index if not exists idx_event_regs_profile_id_fk on public.event_regs (profile_id);
create index if not exists idx_events_created_by_fk on public.events (created_by);
create index if not exists idx_friendships_addressee_fk on public.friendships (addressee);
create index if not exists idx_game_profiles_reviewed_by_fk on public.game_profiles (reviewed_by);
create index if not exists idx_greetings_author_id_fk on public.greetings (author_id);
create index if not exists idx_greetings_target_id_fk on public.greetings (target_id);
create index if not exists idx_invite_codes_created_by_fk on public.invite_codes (created_by);
create index if not exists idx_messages_conversation_id_fk on public.messages (conversation_id);
create index if not exists idx_messages_sender_id_fk on public.messages (sender_id);
create index if not exists idx_post_likes_profile_id_fk on public.post_likes (profile_id);
create index if not exists idx_posts_author_id_fk on public.posts (author_id);
create index if not exists idx_reports_handled_by_fk on public.reports (handled_by);
create index if not exists idx_reports_reporter_id_fk on public.reports (reporter_id);
create index if not exists idx_time_capsules_author_id_fk on public.time_capsules (author_id);
create index if not exists idx_timelines_profile_id_fk on public.timelines (profile_id);
create index if not exists idx_wishes_author_id_fk on public.wishes (author_id);
commit;
