-- Run against a disposable local Supabase database after the migration.
-- This test proves anonymous callers cannot invoke the RPC and authenticated
-- callers cannot attach a log to a different user's identity.
begin;

do $test$
begin
  assert not has_function_privilege(
    'anon',
    'public.log_music_download(text,text,text,text,bigint,text,text,uuid,text)',
    'EXECUTE'
  ), 'anon must not execute the download-log RPC';
  assert has_function_privilege(
    'authenticated',
    'public.log_music_download(text,text,text,text,bigint,text,text,uuid,text)',
    'EXECUTE'
  ), 'authenticated users must retain the download-log RPC';
end;
$test$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $test$
begin
  begin
    perform public.log_music_download(
      'song-1', 'Test song', 'Test artist', 'success', 12345, '', 'Android',
      '22222222-2222-4222-8222-222222222222'::uuid, 'forged@example.test'
    );
    raise exception 'forged user identity was accepted';
  exception
    when insufficient_privilege then null;
  end;
end;
$test$;

rollback;
