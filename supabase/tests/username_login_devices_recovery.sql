-- Disposable local DB only; no emails are sent. Everything rolls back.
begin;
insert into auth.users(id,encrypted_password) values ('11111111-1111-4111-8111-111111111111','test-password-hash-1'),('22222222-2222-4222-8222-222222222222','test-password-hash-2');
insert into public.profiles(id, username) values ('11111111-1111-4111-8111-111111111111','device-owner'), ('22222222-2222-4222-8222-222222222222','other-owner');
set local role service_role;
do $test$
declare
  owner_id uuid := '11111111-1111-4111-8111-111111111111';
  token_h text := repeat('4',64);
  account_h text := repeat('5',64);
  b jsonb;
  i integer;
  cooldown numeric;
begin
  perform public.register_username_login_device(owner_id, token_h);
  assert public.is_username_login_device(token_h, 'device-owner'), 'issued token matches owner';
  assert not public.is_username_login_device(token_h, 'other-owner'), 'token cannot authorize another username';
  assert not public.is_username_login_device(repeat('6',64), 'device-owner'), 'forged token has no advantage';
  assert not public.is_username_login_device(repeat('6',64), 'unknown-owner'), 'unknown username has same invalid-token result';
  assert (select expires_at between clock_timestamp() + interval '29 days' and clock_timestamp() + interval '31 days'
    from login_private.username_login_devices where token_hash = token_h), 'thirty day expiry';
  b := public.begin_username_login_attempt(account_h);
  perform public.finish_username_login_attempt(account_h, (b->>'token')::uuid, false);
  update login_private.username_login_accounts set failures = 30, next_allowed_at = clock_timestamp() + interval '1 hour' where username_hash = account_h;
  assert not (public.begin_username_login_attempt(account_h)->>'allowed')::boolean, 'normal account locked';
  for i in 1..10 loop
    b := public.begin_trusted_username_login_attempt(token_h, 'device-owner');
    assert (b->>'trusted')::boolean and (b->>'allowed')::boolean, 'trusted device bypasses normal lockout using own budget';
    perform public.finish_username_login_attempt(token_h, (b->>'token')::uuid, false);
    select extract(epoch from (next_allowed_at - clock_timestamp())) into cooldown
      from login_private.username_login_accounts where username_hash = token_h;
    assert abs(cooldown - case when i < 3 then 0 else least(15,power(2,least(i-3,4))::integer) end) < 1, 'device backoff schedule';
    update login_private.username_login_accounts set next_allowed_at = clock_timestamp() - interval '1 second' where username_hash = token_h;
  end loop;
  assert not (public.begin_trusted_username_login_attempt(token_h,'device-owner')->>'allowed')::boolean, 'device eleventh denied';
  perform public.revoke_username_login_device(token_h);
  assert not public.is_username_login_device(token_h,'device-owner'), 'revocation immediate';
  assert (public.begin_trusted_username_login_attempt(token_h,'device-owner')->>'trusted')::boolean = false, 'revoked token has no bypass';
  assert (select failures = 30 from login_private.username_login_accounts where username_hash = account_h), 'device never resets attacked normal budget';
  perform public.register_username_login_device(owner_id,repeat('7',64));
  update login_private.username_login_devices set expires_at = clock_timestamp() - interval '1 second' where token_hash = repeat('7',64);
  assert not public.is_username_login_device(repeat('7',64),'device-owner'), 'expired device invalid';
  for i in 1..7 loop
    perform public.register_username_login_device(owner_id,lpad(to_hex(i),64,'0'));
  end loop;
  assert (select count(*) <= 5 from login_private.username_login_devices where user_id = owner_id and revoked_at is null and expires_at > clock_timestamp()), 'at most five active devices';

  -- Unknown usernames get these same account/IP quotas, not a public lookup.
  assert public.consume_username_login_recovery(repeat('a',64),repeat('b',64)), 'first recovery admitted';
  assert not public.consume_username_login_recovery(repeat('a',64),repeat('c',64)), 'rotated IP cannot bypass ten minute cooldown';
  for i in 2..3 loop
    update login_private.username_login_recovery set last_sent_at = clock_timestamp() - interval '11 minutes'
      where scope = 'username' and identifier_hash = repeat('a',64);
    assert public.consume_username_login_recovery(repeat('a',64),lpad(to_hex(i+10),64,'0')), 'first three requests/day admitted';
  end loop;
  update login_private.username_login_recovery set last_sent_at = clock_timestamp() - interval '11 minutes' where scope = 'username' and identifier_hash = repeat('a',64);
  assert not public.consume_username_login_recovery(repeat('a',64),repeat('d',64)), 'fourth recovery/day denied even with fresh IP';
  for i in 1..5 loop
    assert public.consume_username_login_recovery(lpad(to_hex(i+100),64,'0'),repeat('e',64)), 'five requests per IP/hour';
  end loop;
  assert not public.consume_username_login_recovery(repeat('f',64),repeat('e',64)), 'sixth per-IP recovery denied';

  assert not exists(select 1 from login_private.username_login_recovery where scope in ('global_hour','global_day')), 'unknown request quotas do not consume global mail budget';
  -- Stable recipient quota cannot be reset by username rename or IP rotation.
  assert public.consume_username_login_recovery_recipient(repeat('8',64)), 'first recipient admitted';
  assert not public.consume_username_login_recovery_recipient(repeat('8',64)), 'recipient cooldown';
  for i in 2..3 loop
    update login_private.username_login_recovery set last_sent_at=clock_timestamp()-interval '11 minutes' where scope='recipient';
    assert public.consume_username_login_recovery_recipient(repeat('8',64)), 'three per recipient/day';
  end loop;
  update login_private.username_login_recovery set last_sent_at=clock_timestamp()-interval '11 minutes' where scope='recipient';
  assert not public.consume_username_login_recovery_recipient(repeat('8',64)), 'recipient fourth denied';
  delete from login_private.username_login_recovery;
  for i in 1..20 loop
    assert public.consume_username_login_recovery_recipient(lpad(to_hex(i),64,'0')), 'twenty eligible total/hour allowed';
  end loop;
  assert not public.consume_username_login_recovery_recipient(repeat('9',64)), 'global 21st eligible send denied';
  delete from login_private.username_login_recovery;
  for i in 1..100 loop
    update login_private.username_login_recovery set window_started_at=clock_timestamp()-interval '2 hours' where scope='global_hour';
    assert public.consume_username_login_recovery_recipient(lpad(to_hex(i),64,'0')), 'one hundred eligible total/day allowed';
  end loop;
  assert not public.consume_username_login_recovery_recipient(repeat('9',64)), 'global 101st eligible send denied';
  perform public.register_username_login_device(owner_id,repeat('b',64));
  perform public.revoke_all_username_login_devices(owner_id);
  assert not public.is_username_login_device(repeat('b',64),'device-owner'), 'all-device revocation';
  perform public.register_username_login_device(owner_id,repeat('c',64));

end;
$test$;
reset role;
update auth.users set encrypted_password='a-new-test-password-hash' where id='11111111-1111-4111-8111-111111111111';
set local role service_role;
do $check$ begin
  assert not public.is_username_login_device(repeat('c',64),'device-owner'), 'password change invalidates existing device';
end; $check$;
reset role;
do $test$
begin
  assert (select relrowsecurity from pg_class where oid = 'login_private.username_login_devices'::regclass), 'device RLS';
  assert (select relrowsecurity from pg_class where oid = 'login_private.username_login_recovery'::regclass), 'recovery RLS';
  assert not has_table_privilege('anon','login_private.username_login_devices','SELECT'), 'no public tokens';
  assert not has_function_privilege('authenticated','public.register_username_login_device(uuid,text)','EXECUTE'), 'cannot mint own devices';
  assert not has_function_privilege('anon','public.is_username_login_device(text,text)','EXECUTE'), 'no public username/device oracle';
  assert not has_function_privilege('anon','public.consume_username_login_recovery(text,text)','EXECUTE'), 'no direct email quota RPC';
  assert not has_column_privilege('service_role','auth.users','encrypted_password','SELECT'), 'no widened Auth password privilege';
  assert not has_function_privilege('anon','login_private.device_credential_fingerprint(uuid)','EXECUTE'), 'private credential helper inaccessible';
  assert not has_function_privilege('authenticated','public.consume_username_login_recovery_recipient(text)','EXECUTE'), 'recipient quota service only';
  assert not has_function_privilege('anon','public.revoke_all_username_login_devices(uuid)','EXECUTE'), 'revoke all service only';
  assert not has_function_privilege('authenticated','login_private.reserve_login_budget(text,integer,integer,integer,boolean)','EXECUTE'), 'cannot bypass budget through helper';
end;
$test$;
rollback;
