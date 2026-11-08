-- Permit PostgREST upsert to include the conflict key in its update target.
-- RLS still restricts both old and new profile_id values to auth.uid().
grant update (profile_id) on table public.profile_notification_preferences to authenticated;
