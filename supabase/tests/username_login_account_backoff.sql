-- Only a disposable local test DB; all test data rolls back.
begin;
set local role service_role;
do $test$
declare
  h text := repeat('f', 64);
  other_h text := repeat('1', 64);
  crash_h text := repeat('2', 64);
  old_h text := repeat('3', 64);
  b jsonb;
  denied jsonb;
  old_token uuid;
  new_token uuid;
  started timestamptz;
  deadline timestamptz;
  delay_seconds numeric;
  expected integer;
  i integer;
begin
  -- One reservation per username, independent of every IP budget.
  b := public.begin_username_login_attempt(crash_h);
  assert (b->>'allowed')::boolean, 'first reservation allowed';
  old_token := (b->>'token')::uuid;
  denied := public.begin_username_login_attempt(crash_h);
  assert not (denied->>'allowed')::boolean, 'parallel request denied before Auth';
  assert (denied->>'retry_after_ms')::integer > 0, 'retry time returned';
  assert (select failures = 1 from login_private.username_login_accounts where username_hash = crash_h), 'denied attempts not counted';
  -- Simulate a crashed worker lease expiring, never remove its charge.
  update login_private.username_login_accounts
    set reserved_until = clock_timestamp() - interval '1 second', next_allowed_at = clock_timestamp() - interval '1 second'
    where username_hash = crash_h;
  b := public.begin_username_login_attempt(crash_h);
  new_token := (b->>'token')::uuid;
  assert new_token <> old_token, 'lease token rotates';
  assert (select failures = 2 from login_private.username_login_accounts where username_hash = crash_h), 'abandoned attempt counts';
  assert not public.finish_username_login_attempt(crash_h, old_token, true), 'stale success cannot reset new reservation';
  assert public.finish_username_login_attempt(crash_h, new_token, false), 'current completion succeeds';
  assert not public.finish_username_login_attempt(crash_h, new_token, false), 'duplicate completion ignored';

  for i in 1..30 loop
    b := public.begin_username_login_attempt(h);
    assert (b->>'allowed')::boolean, 'up to thirty failed/pending checks allowed';
    assert public.finish_username_login_attempt(h, (b->>'token')::uuid, false), 'failure committed';
    expected := case when i < 5 then 0 else least(60, power(2, least(i - 5, 6))::integer) end;
    select extract(epoch from (next_allowed_at - clock_timestamp())), window_started_at, next_allowed_at
      into delay_seconds, started, deadline
      from login_private.username_login_accounts where username_hash = h;
    assert abs(delay_seconds - expected) < 1, 'exponential backoff schedule';
    if i >= 5 then
      denied := public.begin_username_login_attempt(h);
      assert not (denied->>'allowed')::boolean, 'backoff enforced before Auth';
      assert (select window_started_at = started and next_allowed_at = deadline and failures = i
        from login_private.username_login_accounts where username_hash = h), 'denial cannot extend deadline/window';
    end if;
    -- Advance eligibility in this isolated test instead of waiting 20 minutes.
    update login_private.username_login_accounts set next_allowed_at = clock_timestamp() - interval '1 second'
      where username_hash = h;
  end loop;
  denied := public.begin_username_login_attempt(h);
  assert not (denied->>'allowed')::boolean, '31st check denied regardless of IP or cleared cooldown';
  assert (denied->>'retry_after_ms')::integer > 3500000, 'fixed hourly ceiling returned';
  assert (select failures = 30 and window_started_at = started from login_private.username_login_accounts where username_hash = h), 'blocked attempt cannot extend window';

  b := public.begin_username_login_attempt(other_h);
  assert (b->>'allowed')::boolean, 'different username unaffected';
  assert public.finish_username_login_attempt(other_h, (b->>'token')::uuid, true), 'success accepted';
  assert not exists (select 1 from login_private.username_login_accounts where username_hash = other_h), 'success resets own account';
  assert (select failures = 30 from login_private.username_login_accounts where username_hash = h), 'other account not reset';

  update login_private.username_login_accounts set window_started_at = clock_timestamp() - interval '61 minutes'
    where username_hash = h;
  b := public.begin_username_login_attempt(h);
  assert (b->>'allowed')::boolean, 'hourly window expires';
  assert (select failures = 1 from login_private.username_login_accounts where username_hash = h), 'fresh window begins at one';
  perform public.finish_username_login_attempt(h, (b->>'token')::uuid, false);

  insert into login_private.username_login_accounts (username_hash, window_started_at)
    values (old_h, clock_timestamp() - interval '25 hours');
  perform public.begin_username_login_attempt(other_h);
  assert not exists (select 1 from login_private.username_login_accounts where username_hash = old_h), 'retention cleanup';
  begin
    perform public.begin_username_login_attempt('raw username');
    raise exception 'invalid hash accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$test$;
reset role;
do $test$
begin
  assert (select relrowsecurity from pg_class where oid = 'login_private.username_login_accounts'::regclass), 'account table RLS enabled';
  assert not has_table_privilege('anon', 'login_private.username_login_accounts', 'SELECT'), 'anon cannot read hashes';
  assert not has_table_privilege('authenticated', 'login_private.username_login_accounts', 'UPDATE'), 'user cannot reset budget';
  assert not has_function_privilege('anon', 'public.begin_username_login_attempt(text)', 'EXECUTE'), 'anon cannot reserve';
  assert not has_function_privilege('authenticated', 'public.begin_username_login_attempt(text)', 'EXECUTE'), 'user cannot reserve';
  assert not has_function_privilege('anon', 'public.finish_username_login_attempt(text,uuid,boolean)', 'EXECUTE'), 'anon cannot finish';
  assert not has_function_privilege('authenticated', 'public.finish_username_login_attempt(text,uuid,boolean)', 'EXECUTE'), 'user cannot finish';
  assert not (select prosecdef from pg_proc where oid = 'public.begin_username_login_attempt(text)'::regprocedure), 'begin is invoker';
  assert not (select prosecdef from pg_proc where oid = 'public.finish_username_login_attempt(text,uuid,boolean)'::regprocedure), 'finish is invoker';
end;
$test$;
rollback;
