-- 20261121112000_reassert_authenticated_download_log_access.sql
-- PR #781 intentionally makes download-log writes authenticated-only.
-- A later compatibility grant must not reopen the anonymous execute path.
-- The radio Worker validates the access token and forwards that same user token.

revoke all on function public.log_music_download(
  text, text, text, text, bigint, text, text, uuid, text
) from public, anon;

grant execute on function public.log_music_download(
  text, text, text, text, bigint, text, text, uuid, text
) to authenticated;
