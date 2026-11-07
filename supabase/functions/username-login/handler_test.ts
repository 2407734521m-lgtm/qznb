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

function request(username = 'classmate', ip: string | null = '203.0.113.1') {
  return new Request('https://edge.example/username-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'cf-connecting-ip': ip } : {}) },
    body: JSON.stringify({ username, password: 'incorrect' }),
  });
}
function mock(options: { unknown?: boolean; noEmail?: boolean; allowed?: boolean; rpcError?: boolean; success?: boolean; unconfirmed?: boolean } = {}) {
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
    } else if (path.endsWith('/clear_username_login_attempts')) data = null;
    else if (path.endsWith('/profiles')) data = options.unknown ? [] : [{ id: '11111111-1111-4111-8111-111111111111' }];
    else if (path.endsWith('/profile_emails')) data = options.unknown || options.noEmail ? [] : [{ email: 'real@example.test' }];
    else if (path.endsWith('/token')) {
      if (options.success) data = {
        access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600,
        token_type: 'bearer', user: { id: 'test-user', aud: 'authenticated' },
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
    equal(calls.map((c) => c.path), ['/rest/v1/rpc/consume_username_login_attempt', '/rest/v1/profiles', '/rest/v1/profile_emails', '/auth/v1/token']);
    const auth = calls[3].body;
    assert(options.unknown || options.noEmail ? String(auth.email).endsWith('@username-login.invalid') : auth.email === 'real@example.test');
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
});

Deno.test('unconfirmed email retains frontend error code', async () => {
  const { fetcher } = mock({ unconfirmed: true });
  equal(await (await handleRequest(request(), fetcher)).json(), { ok: false, code: 'email_not_confirmed' });
});
