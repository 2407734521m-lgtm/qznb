import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendRecovery } from './recovery.ts';
import { cookieOriginAllowed, deviceSecret, deviceCookie, DEVICE_TTL } from './device-cookie.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function hashIdentifier(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// IP metadata is best-effort, NOT an authenticated identity. Prefer CF over
// client-controlled XFF, but the independent username budget is authoritative.
export function clientIp(req: Request): string | null {
  const value = req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!value || value.length > 64 || !/^[0-9a-fA-F:.]+$/.test(value)) return null;
  if (value.includes(':')) {
    try { return new URL(`http://[${value}]/`).hostname.toLowerCase(); } catch { return null; }
  }
  const octets = value.split('.');
  if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return octets.map(Number).join('.');
}

export async function handleRequest(req: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const startedAt = performance.now();
  const failureDelay = 800 + crypto.getRandomValues(new Uint8Array(1))[0] % 101;
  async function credentialFailure(code = 'invalid_credentials') {
    // Both paths make the same database/Auth requests, then use the same floor.
    // This reduces (not eliminates) timing leakage from upstream latency.
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, failureDelay - (performance.now() - startedAt))));
    return response({ ok: false, code });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, code: 'invalid_request' }, 405);

  let payload: { username?: unknown; password?: unknown; action?: unknown; remember_device?: unknown };
  try { payload = await req.json(); if (!payload || typeof payload !== 'object') throw new Error('invalid payload'); } catch { return response({ ok: false, code: 'invalid_request' }, 400); }

  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const action = payload.action || 'login';
  if (!['login', 'email_recovery', 'revoke_device', 'revoke_all_devices'].includes(String(action))) return response({ ok: false, code: 'invalid_request' }, 400);
  if (action === 'login' && (!username || username.length > 30 || !password || password.length > 256)) {
    return response({ ok: false, code: 'invalid_request' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return response({ ok: false, code: 'unavailable' }, 503);

  const ip = clientIp(req);
  // Never collapse missing IPs into one shared bucket (which could lock out
  // everyone), or let missing headers bypass the limiter.
  if (!ip) return response({ ok: false, code: 'unavailable' }, 503);
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  };
  const admin = createClient(url, serviceKey, options);
  const ipHash = await hashIdentifier(`ip:${ip}`);
  const usernameHash = await hashIdentifier(JSON.stringify(['username', username.toLowerCase()]));
  const rawDevice = deviceSecret(req);
  const deviceHash = rawDevice ? await hashIdentifier(rawDevice) : '';
  const recoveryReply = async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, failureDelay - (performance.now() - startedAt))));
    return response({ ok: true, message: '若账号已完成可用邮箱验证且未超过发送限额，将收到登录链接；未绑定或未启用时请联系管理员核验。' });
  };
  if (action === 'email_recovery') {
    if (!username || username.length > 30) return recoveryReply();
    try {
      const { data: canSend, error } = await admin.rpc('consume_username_login_recovery', { p_username_hash: usernameHash, p_ip_hash: ipHash });
      if (!error && canSend === true && username && username.length <= 30) {
        const task = sendRecovery(admin, createClient(url, anonKey, options), username).catch(() => {});
        const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
        if (runtime) runtime.waitUntil(task); else await task;
      }
    } catch { /* Deliberately identical: no email, quota or provider error oracle. */ }
    return recoveryReply();
  }
  let trusted = false;
  if (action === 'login' && deviceHash) {
    const { data, error } = await admin.rpc('is_username_login_device', { p_token_hash: deviceHash, p_username: username });
    if (error) return response({ ok: false, code: 'unavailable' }, 503);
    trusted = data === true;
  }
  const identifierHash = await hashIdentifier(JSON.stringify(trusted
    ? ['trusted-pair', ip, username.toLowerCase(), deviceHash]
    : ['pair', ip, username.toLowerCase()]));

  // Charge unknown usernames too, before lookup. The IP-wide quota bounds the
  // number of pair rows created by username spraying and is NOT reset on login.
  const { data: allowed, error: limitError } = await admin.rpc('consume_username_login_attempt', {
    p_ip_hash: ipHash,
    p_identifier_hash: identifierHash,
  });
  if (limitError) return response({ ok: false, code: 'unavailable' }, 503);
  if (allowed !== true) return response({ ok: false, code: 'rate_limited' });

  if (action === 'revoke_device' || action === 'revoke_all_devices') {
    if (!cookieOriginAllowed(req)) return response({ ok: false, code: 'invalid_request' }, 400);
    if (action === 'revoke_all_devices') {
      const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      const { data, error } = await admin.auth.getUser(bearer);
      if (error || !data.user) return response({ ok: false, code: 'invalid_credentials' });
      const { error: revokeError } = await admin.rpc('revoke_all_username_login_devices', { p_user_id: data.user.id });
      if (revokeError) return response({ ok: false, code: 'unavailable' }, 503);
    } else {
      const { error } = await admin.rpc('revoke_username_login_device', { p_token_hash: deviceHash || '0'.repeat(64) });
      if (error) return response({ ok: false, code: 'unavailable' }, 503);
    }
    return response({ ok: true }, 200, { 'Set-Cookie': deviceCookie('', true) });
  }
  async function issueDevice(userId: string) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
    const { error } = await admin.rpc('register_username_login_device', { p_user_id: userId, p_token_hash: await hashIdentifier(token) });
    return error ? null : token;
  }

  // Account identity never contains an IP. Reserve a single outstanding check
  // atomically; rotated/spoofed headers and parallel requests cannot bypass it.
  const { data: budget, error: budgetError } = trusted
    ? await admin.rpc('begin_trusted_username_login_attempt', { p_token_hash: deviceHash, p_username: username })
    : await admin.rpc('begin_username_login_attempt', { p_username_hash: usernameHash });
  if (trusted && budget?.trusted === false) return credentialFailure();
  if (budgetError || typeof budget?.allowed !== 'boolean') {
    return response({ ok: false, code: 'unavailable' }, 503);
  }
  if (!budget.allowed) {
    if (!Number.isFinite(budget.retry_after_ms) || budget.retry_after_ms <= 0) {
      return response({ ok: false, code: 'unavailable' }, 503);
    }
    const retryAfter = Math.min(3600000, Math.ceil(budget.retry_after_ms));
    return response({ ok: false, code: 'rate_limited', retry_after_ms: retryAfter }, 200, {
      'Retry-After': String(Math.ceil(retryAfter / 1000)),
      'Access-Control-Expose-Headers': 'Retry-After',
    });
  }
  if (typeof budget.token !== 'string' || !/^[0-9a-f-]{36}$/.test(budget.token)) {
    return response({ ok: false, code: 'unavailable' }, 503);
  }

  // Resolve the private email only on the server; never return it in an error.
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .limit(2);
  if (profileError) return response({ ok: false, code: 'unavailable' }, 503);
  const profileId = profiles?.length === 1 ? profiles[0].id : null;
  const { data: emails, error: emailError } = await admin
    .from('profile_emails')
    .select('email')
    .eq('profile_id', profileId || '00000000-0000-0000-0000-000000000000')
    .limit(2);
  if (emailError) return response({ ok: false, code: 'unavailable' }, 503);
  const email = profileId && emails?.length === 1 ? emails[0].email : null;

  // A random, reserved-domain dummy login does equivalent Auth work for missing
  // profiles/emails. Never authenticate a real account using the dummy branch.
  const auth = createClient(url, anonKey, options);
  const { data, error } = await auth.auth.signInWithPassword({
    email: email || `missing-${crypto.randomUUID()}@username-login.invalid`,
    password: email ? password : crypto.randomUUID(),
  });
  const success = Boolean(email && !error && data.session);
  const { data: finished, error: finishError } = await admin.rpc('finish_username_login_attempt', {
    p_username_hash: trusted ? deviceHash : usernameHash,
    p_token: budget.token,
    p_success: success,
  });
  // Missing/failed/stale completion is conservative: retain the reservation and
  // do not return a session which has not passed the account budget protocol.
  if (finishError || finished !== true) return response({ ok: false, code: 'unavailable' }, 503);
  if (!success) {
    if (email && /email not confirmed/i.test(error?.message || '')) {
      return credentialFailure('email_not_confirmed');
    }
    return credentialFailure();
  }

  // Only this IP/account pair is reset; success must not reset the spray limit.
  await admin.rpc('clear_username_login_attempts', { p_identifier_hash: identifierHash });
  let newDevice: string | null = null;
  if (payload.remember_device === true && cookieOriginAllowed(req) && !trusted && data.user?.id === profileId) newDevice = await issueDevice(profileId);
  return response({ ok: true, session: data.session, ...(newDevice ? { device_trusted: true, device_expires_in: DEVICE_TTL } : {}) }, 200, newDevice ? { 'Set-Cookie': deviceCookie(newDevice) } : {});
}
