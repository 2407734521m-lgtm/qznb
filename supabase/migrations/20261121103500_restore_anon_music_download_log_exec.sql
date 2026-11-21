-- 20261121103500_restore_anon_music_download_log_exec.sql
-- Guest download telemetry is intentionally public. Explicitly preserve anon
-- execution after hardening the function's identity and input validation.

grant execute on function public.log_music_download(
  text, text, text, text, bigint, text, text, uuid, text
) to anon, authenticated;
