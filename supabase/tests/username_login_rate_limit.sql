-- Run against a disposable LOCAL database after the migration, never production.
-- Uses transactions/rollback; no pgTAP dependency.
begin;
set local role service_role;

do $test$
declare
  i integer;
  ip_a text := repeat('a', 64);
  ip_b text := repeat('b', 64);
  pair_a text := repeat('c', 64);
  pair_b text := repeat('d', 64);
begin
  for i in 1..8 loop
    assert public.consume_username_login_attempt(ip_a, pair_a), 'first eight pair attempts allowed';
  end loop;
  assert not public.consume_username_login_attempt(ip_a, pair_a), 'ninth pair attempt denied';
  assert public.consume_username_login_attempt(ip_b, pair_b), 'another IP can use same username';
  perform public.clear_username_login_attempts(pair_a);
  assert public.consume_username_login_attempt(ip_a, pair_a), 'success resets only pair';
  assert (select attempts = 10 from login_private.username_login_ip_attempts where ip_hash = ip_a), 'success must not reset IP budget';

  -- Spray distinct (possibly nonexistent) usernames. Ten attempts already used.
  for i in 11..60 loop
    assert public.consume_username_login_attempt(ip_a, lpad(to_hex(i), 64, '0')), 'IP quota allows first sixty attempts';
  end loop;
  assert not public.consume_username_login_attempt(ip_a, repeat('e', 64)), '61st attempt denied';
  assert not exists (select 1 from login_private.username_login_attempts where identifier_hash = repeat('e', 64)), 'blocked IP must not allocate pair rows';
  for i in 1..10 loop
    assert not public.consume_username_login_attempt(ip_a, repeat('e', 64)), 'blocked IP stays blocked';
  end loop;
  assert (select attempts = 61 from login_private.username_login_ip_attempts where ip_hash = ip_a), 'IP counter saturates safely';

  update login_private.username_login_ip_attempts set window_started_at = now() - interval '16 minutes' where ip_hash = ip_a;
  update login_private.username_login_attempts set window_started_at = now() - interval '16 minutes' where identifier_hash = pair_a;
  assert public.consume_username_login_attempt(ip_a, pair_a), 'expired windows reset';
  assert (select attempts = 1 from login_private.username_login_ip_attempts where ip_hash = ip_a), 'IP window reset to one';
  assert (select attempts = 1 from login_private.username_login_attempts where identifier_hash = pair_a), 'pair window reset to one';

  update login_private.username_login_ip_attempts set window_started_at = now() - interval '25 hours' where ip_hash = ip_b;
  update login_private.username_login_attempts set window_started_at = now() - interval '25 hours' where identifier_hash = pair_b;
  perform public.consume_username_login_attempt(ip_a, pair_a);
  assert not exists (select 1 from login_private.username_login_ip_attempts where ip_hash = ip_b), 'expired IP rows removed';
  assert not exists (select 1 from login_private.username_login_attempts where identifier_hash = pair_b), 'expired pair rows removed';

  begin
    perform public.consume_username_login_attempt(null, pair_a);
    raise exception 'null hash accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.consume_username_login_attempt(ip_a, 'raw IP or username');
    raise exception 'invalid hash accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$test$;

reset role;
do $test$
begin
  assert (select relrowsecurity from pg_class where oid = 'login_private.username_login_attempts'::regclass), 'pair RLS remains enabled';
  assert (select relrowsecurity from pg_class where oid = 'login_private.username_login_ip_attempts'::regclass), 'IP RLS enabled';
  assert not has_function_privilege('anon', 'public.consume_username_login_attempt(text,text)', 'EXECUTE'), 'anon cannot consume';
  assert not has_function_privilege('authenticated', 'public.consume_username_login_attempt(text,text)', 'EXECUTE'), 'authenticated cannot consume';
  assert not has_function_privilege('anon', 'public.clear_username_login_attempts(text)', 'EXECUTE'), 'anon cannot clear';
  assert not has_function_privilege('authenticated', 'public.clear_username_login_attempts(text)', 'EXECUTE'), 'authenticated cannot clear';
  assert not has_table_privilege('anon', 'login_private.username_login_ip_attempts', 'SELECT'), 'anon cannot read hashes';
  assert to_regprocedure('public.consume_username_login_attempt(text)') is null, 'legacy username-only RPC removed';
  assert not (select prosecdef from pg_proc where oid = 'public.consume_username_login_attempt(text,text)'::regprocedure), 'RPC is security invoker';
end;
$test$;
rollback;
