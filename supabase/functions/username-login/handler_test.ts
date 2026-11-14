import { DEVICE_COOKIE, deviceSecret } from './device-cookie.ts';
import { clientIp, handleRequest } from './handler.ts';

function assert(value: unknown, message = 'assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
function equal(a: unknown, b: unknown) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
Deno.env.set('SUPABASE_URL', 'https://login-test.example');
Deno.env.set('SUPABASE_ANON_KEY', 'test-anon');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
Deno.env.set('USERNAME_LOGIN_COOKIE_ORIGINS','https://app.example');

function request(username = 'classmate', ip: string | null = '203.0.113.1', extra: Record<string, unknown> = {}, rawCookie = '') {
  return new Request('https://edge.example/username-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin:'https://app.example', 'Sec-Fetch-Site':'same-origin', ...(rawCookie ? {Cookie:`${DEVICE_COOKIE}=${rawCookie}`} : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}) },
    body: JSON.stringify({ username, password: 'incorrect', ...extra }),
  });
}
function mock(options: { unknown?: boolean; noEmail?: boolean; allowed?: boolean; rpcError?: boolean; success?: boolean; unconfirmed?: boolean; budgetDenied?: boolean; beginError?: boolean; finishError?: boolean; stale?: boolean; deviceValid?: boolean; deviceDenied?: boolean; recoveryDenied?: boolean; synthetic?: boolean; unverified?: boolean; mappingMismatch?: boolean; unattested?: boolean; recipientDenied?: boolean; authDenied?: boolean } = {}) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, body });
    let data: unknown;
    let status = 200;
    if (path.endsWith('/consume_username_login_attempt')) {
      data = options.rpcError ? { message: 'db unavailable' } : options.allowed !== false;
      if (options.rpcError) status = 500;
    } else if (path.endsWith('/is_username_login_device')) data = options.deviceValid === true;
    else if (path.endsWith('/begin_trusted_username_login_attempt')) data = { trusted: true, allowed: !options.deviceDenied, token: '11111111-1111-4111-8111-111111111111', retry_after_ms: 15000 };
    else if (path.endsWith('/register_username_login_device') || path.endsWith('/revoke_username_login_device')) data = null;
    else if (path.endsWith('/revoke_all_username_login_devices')) data=null;
    else if (path.endsWith('/auth/v1/user')) { status=options.authDenied?401:200; data=options.authDenied?{message:'invalid JWT'}:{id:'11111111-1111-4111-8111-111111111111'}; }
    else if (path.endsWith('/consume_username_login_recovery_recipient')) data=!options.recipientDenied;
    else if (path.endsWith('/consume_username_login_recovery')) data = !options.recoveryDenied;
    else if (path.endsWith('/otp')) data = {};
    else if (path.includes('/admin/users/')) {
      status = options.unknown ? 404 : 200;
      data = options.unknown ? { message: 'not found' } : { id: '11111111-1111-4111-8111-111111111111', email: options.mappingMismatch ? '999999@qq.com' : options.synthetic ? 'fake@username-login.invalid' : '123456@qq.com', email_confirmed_at: options.unverified ? null : '2026-11-01T00:00:00Z', app_metadata:options.unattested?{}:{username_recovery_email_sha256:'bf3ce8c5d909f3d07061e045e18c4ba57b0217faf1a5d835653bb95130459dd7'}, user_metadata:{username_recovery_email_sha256:'bf3ce8c5d909f3d07061e045e18c4ba57b0217faf1a5d835653bb95130459dd7'} };
    } else if (path.endsWith('/begin_username_login_attempt')) {
      data = options.beginError ? { message: 'account budget unavailable' }
        : options.budgetDenied ? { allowed: false, retry_after_ms: 32000 }
        : { allowed: true, token: '11111111-1111-4111-8111-111111111111' };
      if (options.beginError) status = 500;
    } else if (path.endsWith('/finish_username_login_attempt')) {
      data = options.finishError ? { message: 'completion unavailable' } : !options.stale;
      if (options.finishError) status = 500;
    } else if (path.endsWith('/clear_username_login_attempts')) data = null;
    else if (path.endsWith('/profiles')) data = options.unknown ? [] : [{ id: '11111111-1111-4111-8111-111111111111' }];
    else if (path.endsWith('/profile_emails')) data = options.unknown || options.noEmail ? [] : [{ email: options.synthetic ? 'fake@username-login.invalid' : '123456@qq.com' }];
    else if (path.endsWith('/token')) {
      if (options.success) data = {
        access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600,
        token_type: 'bearer', user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated' },
      };
      else {
        status = 400;
        data = { error_code: options.unconfirmed ? 'email_not_confirmed' : 'invalid_credentials', msg: options.unconfirmed ? 'Email not confirmed' : 'Invalid login credentials' };
      }
    } else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetcher };
}

Deno.test('IP extraction prefers CF, falls back to first XFF, normalizes and rejects malformed IPs', () => {
  equal(clientIp(new Request('https://test', { headers: { 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '198.51.100.1, 192.0.2.1' } })), '203.0.113.1');
  equal(clientIp(new Request('https://test', { headers: { 'x-forwarded-for': '198.51.100.1, 192.0.2.1' } })), '198.51.100.1');
  equal(clientIp(new Request('https://test', { headers: { 'cf-connecting-ip': '2001:0db8:0:0:0:0:0:1' } })), '[2001:db8::1]');
  for (const value of ['999.1.1.1', ':::::', 'unknown']) equal(clientIp(request('x', value)), null);
});

Deno.test('unknown username, missing email and wrong password share requests, generic error and timing floor', async () => {
  const durations: number[] = [];
  for (const options of [{}, { unknown: true }, { noEmail: true }]) {
    const { calls, fetcher } = mock(options);
    const start = performance.now();
    const response = await handleRequest(request(), fetcher);
    durations.push(performance.now() - start);
    equal(response.status, 200);
    equal(await response.json(), { ok: false, code: 'invalid_credentials' });
    equal(calls.map((c) => c.path), ['/rest/v1/rpc/consume_username_login_attempt', '/rest/v1/rpc/begin_username_login_attempt', '/rest/v1/profiles', '/rest/v1/profile_emails', '/auth/v1/token', '/rest/v1/rpc/finish_username_login_attempt']);
    const auth = calls[4].body;
    equal(calls[5].body.p_success, false);
    assert(options.unknown || options.noEmail ? String(auth.email).endsWith('@username-login.invalid') : auth.email === '123456@qq.com');
  }
  assert(durations.every((n) => n >= 790), `missing failure delay: ${durations}`);
  assert(Math.max(...durations) - Math.min(...durations) < 350, `unexpected timing gap: ${durations}`);
});

Deno.test('pair hash changes across IPs; only hashes reach RPC; same IP global hash survives username changes', async () => {
  const bodies = [];
  for (const [user, ip] of [['classmate', '203.0.113.1'], ['classmate', '203.0.113.2'], ['other', '203.0.113.1']]) {
    const { calls, fetcher } = mock({ allowed: false });
    equal(await (await handleRequest(request(user, ip), fetcher)).json(), { ok: false, code: 'rate_limited' });
    equal(calls.length, 1); // unknown names cannot bypass a pre-lookup limit
    bodies.push(calls[0].body);
    assert(Object.values(calls[0].body).every((v) => /^[0-9a-f]{64}$/.test(String(v))));
  }
  assert(bodies[0].p_identifier_hash !== bodies[1].p_identifier_hash);
  assert(bodies[0].p_identifier_hash !== bodies[2].p_identifier_hash);
  equal(bodies[0].p_ip_hash, bodies[2].p_ip_hash);
});

Deno.test('missing IP and limiter errors fail closed before profile lookup', async () => {
  const missing = mock();
  equal((await handleRequest(request('classmate', null), missing.fetcher)).status, 503);
  equal(missing.calls.length, 0);
  const broken = mock({ rpcError: true });
  equal((await handleRequest(request(), broken.fetcher)).status, 503);
  equal(broken.calls.length, 1);
});

Deno.test('successful login preserves session shape and clears pair only', async () => {
  const { calls, fetcher } = mock({ success: true });
  const response = await handleRequest(request(), fetcher);
  const data = await response.json();
  assert(data.ok && data.session.access_token === 'test-access' && data.session.refresh_token === 'test-refresh');
  equal(calls.at(-1)?.path, '/rest/v1/rpc/clear_username_login_attempts');
  equal(calls.at(-1)?.body, { p_identifier_hash: calls[0].body.p_identifier_hash });
  equal(calls[5].body.p_success, true);
});

Deno.test('unconfirmed email retains frontend error code', async () => {
  const { fetcher } = mock({ unconfirmed: true });
  equal(await (await handleRequest(request(), fetcher)).json(), { ok: false, code: 'email_not_confirmed' });
});

Deno.test('rotating forged IP headers cannot change the username budget or bypass its denial', async () => {
  const hashes: unknown[] = [];
  for (const ip of ['203.0.113.1', '198.51.100.2', '192.0.2.3']) {
    const { calls, fetcher } = mock({ budgetDenied: true });
    const response = await handleRequest(request('Classmate', ip), fetcher);
    equal(await response.json(), { ok: false, code: 'rate_limited', retry_after_ms: 32000 });
    equal(response.headers.get('Retry-After'), '32');
    equal(calls.length, 2); // Auth and profile lookup were never reached.
    hashes.push(calls[1].body.p_username_hash);
    assert(/^[0-9a-f]{64}$/.test(String(hashes.at(-1))));
  }
  equal(hashes[0], hashes[1]);
  equal(hashes[1], hashes[2]);
  const { calls, fetcher } = mock({ budgetDenied: true });
  await handleRequest(request(' classmate ', '203.0.113.4'), fetcher);
  equal(calls[1].body.p_username_hash, hashes[0]);
});

Deno.test('username budget errors fail closed before authentication', async () => {
  const { calls, fetcher } = mock({ beginError: true });
  equal((await handleRequest(request(), fetcher)).status, 503);
  equal(calls.length, 2);
});

Deno.test('failed or stale completion never returns a successful session', async () => {
  for (const options of [{ finishError: true }, { stale: true }]) {
    const { calls, fetcher } = mock({ success: true, ...options });
    const response = await handleRequest(request(), fetcher);
    equal(response.status, 503);
    equal(await response.json(), { ok: false, code: 'unavailable' });
    equal(calls.length, 6);
  }
});

Deno.test('valid trusted token uses separate budget and pair namespace even when username budget would deny', async () => {
  const raw = 'a'.repeat(64);
  const { calls, fetcher } = mock({ deviceValid: true, budgetDenied: true, success: true });
  const res = await handleRequest(request('classmate', '203.0.113.1', {}, raw), fetcher);
  assert((await res.json()).ok);
  assert(calls.some((c) => c.path.endsWith('/begin_trusted_username_login_attempt')));
  assert(!calls.some((c) => c.path.endsWith('/begin_username_login_attempt')));
  const check = calls[0].body;
  assert(check.p_token_hash !== raw && /^[0-9a-f]{64}$/.test(String(check.p_token_hash)));
  const finish = calls.find((c) => c.path.endsWith('/finish_username_login_attempt'))!;
  equal(finish.body.p_username_hash, check.p_token_hash);
});

Deno.test('forged device token gets normal username lockout, for real and unknown usernames', async () => {
  for (const unknown of [false, true]) {
    const { calls, fetcher } = mock({ budgetDenied: true, unknown });
    equal((await (await handleRequest(request('classmate','203.0.113.1',{},'b'.repeat(64)),fetcher)).json()).code, 'rate_limited');
    assert(!calls.some((c) => c.path.endsWith('/begin_trusted_username_login_attempt')));
    assert(calls.some((c) => c.path.endsWith('/begin_username_login_attempt')));
  }
});

Deno.test('opt-in successful password login issues random device token; DB receives only its hash', async () => {
  const { calls, fetcher } = mock({ success: true });
  const response = await handleRequest(request('classmate','203.0.113.1',{remember_device:true}),fetcher);
  const data=await response.json();
  const cookie=response.headers.get('Set-Cookie') || '';
  const raw=cookie.split(';')[0].split('=')[1];
  assert(/^[0-9a-f]{64}$/.test(raw));
  assert(cookie.includes('Secure; HttpOnly; SameSite=Strict'));
  assert(!JSON.stringify(data).includes(raw) && !('device_token' in data));
  equal(data.device_expires_in,2592000);
  const registration = calls.find((c) => c.path.endsWith('/register_username_login_device'))!;
  assert(registration.body.p_token_hash !== raw);
  equal(registration.body.p_user_id,'11111111-1111-4111-8111-111111111111');
  const failed = mock();
  await handleRequest(request('classmate','203.0.113.1',{remember_device:true}),failed.fetcher);
  assert(!failed.calls.some((c) => c.path.endsWith('/register_username_login_device')));
});

Deno.test('revocation returns generic success without exposing whether token exists', async () => {
  const { calls, fetcher } = mock();
  equal(await (await handleRequest(request('', '203.0.113.1', { action:'revoke_device' },'c'.repeat(64)),fetcher)).json(), {ok:true});
  assert(calls.at(-1)?.path.endsWith('/revoke_username_login_device'));
});

Deno.test('recovery is disabled by default, and rate-limited requests never send email', async () => {
  Deno.env.delete('USERNAME_EMAIL_RECOVERY_ENABLED');
  const disabled=mock();
  const a=await (await handleRequest(request('classmate','203.0.113.1',{action:'email_recovery'}),disabled.fetcher)).json();
  equal(disabled.calls.length,1);
  const denied=mock({recoveryDenied:true});
  const b=await (await handleRequest(request('missing','203.0.113.2',{action:'email_recovery'}),denied.fetcher)).json();
  equal(a,b); equal(denied.calls.length,1);
});

Deno.test('enabled recovery sends only to confirmed real QQ mapping, never creates users, returns identical messages', async () => {
  Deno.env.set('USERNAME_EMAIL_RECOVERY_ENABLED','true');
  Deno.env.set('USERNAME_LOGIN_REDIRECT_URL','https://example.test/');
  let expected: unknown;
  try {
    for (const options of [{},{unknown:true},{synthetic:true},{unverified:true},{mappingMismatch:true},{unattested:true},{recipientDenied:true}]) {
      const {calls,fetcher}=mock(options);
      const data=await (await handleRequest(request('classmate','203.0.113.1',{action:'email_recovery'}),fetcher)).json();
      if (!expected) expected=data; else equal(data,expected);
      const sends=calls.filter((c)=>c.path.endsWith('/otp'));
      equal(sends.length,Object.keys(options).length ? 0 : 1);
      if(sends.length) { equal(sends[0].body.create_user,false); equal(sends[0].body.email,'123456@qq.com'); }
      assert(!JSON.stringify(data).includes('123456@qq.com'));
    }
  } finally { Deno.env.delete('USERNAME_EMAIL_RECOVERY_ENABLED'); Deno.env.delete('USERNAME_LOGIN_REDIRECT_URL'); }
});

Deno.test('a trusted device never substitutes for a correct password and cannot bypass IP quotas', async () => {
  const failed=mock({deviceValid:true});
  equal((await (await handleRequest(request('classmate','203.0.113.1',{},'a'.repeat(64)),failed.fetcher)).json()).code,'invalid_credentials');
  assert(failed.calls.some(c=>c.path.endsWith('/token')));
  const denied=mock({deviceValid:true,allowed:false});
  equal((await (await handleRequest(request('classmate','203.0.113.1',{},'a'.repeat(64)),denied.fetcher)).json()).code,'rate_limited');
  assert(!denied.calls.some(c=>c.path.endsWith('/token')));
});
Deno.test('JSON device secrets are ignored; unapproved origins cannot issue or revoke cookies', async () => {
  const bodyOnly=mock({deviceValid:true,budgetDenied:true});
  equal((await (await handleRequest(request('classmate','203.0.113.1',{device_token:'a'.repeat(64)}),bodyOnly.fetcher)).json()).code,'rate_limited');
  assert(!bodyOnly.calls.some(c=>c.path.endsWith('/is_username_login_device')));
  const req=request('classmate','203.0.113.1',{remember_device:true});
  req.headers.set('Origin','https://evil.example');
  const success=mock({success:true});
  assert(!(await handleRequest(req,success.fetcher)).headers.has('Set-Cookie'));
  const revoke=request('', '203.0.113.1',{action:'revoke_device'});
  revoke.headers.delete('Origin');
  equal((await handleRequest(revoke,mock().fetcher)).status,400);
});
Deno.test('revoke-all requires verified Auth identity, never a body user_id', async () => {
  const req=request('', '203.0.113.1',{action:'revoke_all_devices',user_id:'attacker-selected'});
  req.headers.set('Authorization','Bearer test-user-jwt');
  const good=mock();
  const res=await handleRequest(req,good.fetcher);
  equal(await res.json(),{ok:true});
  assert(res.headers.get('Set-Cookie')?.includes('Max-Age=0'));
  equal(good.calls.at(-1)?.body,{p_user_id:'11111111-1111-4111-8111-111111111111'});
  const bad=mock({authDenied:true});
  equal((await (await handleRequest(request('', '203.0.113.1',{action:'revoke_all_devices'}),bad.fetcher)).json()).code,'invalid_credentials');
  assert(!bad.calls.some(c=>c.path.endsWith('/revoke_all_username_login_devices')));
});

Deno.test('cookie parsing rejects ambiguous duplicate tokens and is disabled without an origin allowlist', () => {
  const req=request('classmate','203.0.113.1',{},'a'.repeat(64));
  req.headers.set('Cookie',`${DEVICE_COOKIE}=${'a'.repeat(64)}; ${DEVICE_COOKIE}=${'b'.repeat(64)}`);
  equal(deviceSecret(req),'');
  const sibling=request('classmate','203.0.113.1',{},'a'.repeat(64));
  sibling.headers.set('Sec-Fetch-Site','same-site');
  equal(deviceSecret(sibling),'');
  sibling.headers.delete('Sec-Fetch-Site');
  equal(deviceSecret(sibling),'');
  Deno.env.delete('USERNAME_LOGIN_COOKIE_ORIGINS');
  try { equal(deviceSecret(request('classmate','203.0.113.1',{},'a'.repeat(64))),''); }
  finally { Deno.env.set('USERNAME_LOGIN_COOKIE_ORIGINS','https://app.example'); }
});
Deno.test('unsafe recovery redirect cannot trigger any Auth mail send even for an attested account', async () => {
  Deno.env.set('USERNAME_EMAIL_RECOVERY_ENABLED','true');
  Deno.env.set('USERNAME_LOGIN_REDIRECT_URL','https://user:password@example.test/');
  try {
    const {calls,fetcher}=mock();
    const res=await handleRequest(request('classmate','203.0.113.1',{action:'email_recovery'}),fetcher);
    equal(res.status,200);
    equal(calls.length,1);
  } finally { Deno.env.delete('USERNAME_EMAIL_RECOVERY_ENABLED'); Deno.env.delete('USERNAME_LOGIN_REDIRECT_URL'); }
});
