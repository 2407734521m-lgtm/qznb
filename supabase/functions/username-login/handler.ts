import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function hashIdentifier(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLocaleLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// The gateway must overwrite client-supplied forwarding headers. Prefer the
// Cloudflare edge value; XFF's first entry is a fallback for other gateways.
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

  let payload: { username?: unknown; password?: unknown };
  try { payload = await req.json(); if (!payload || typeof payload !== 'object') throw new Error('invalid payload'); } catch { return response({ ok: false, code: 'invalid_request' }, 400); }

  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!username || username.length > 30 || !password || password.length > 256) {
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
  const identifierHash = await hashIdentifier(JSON.stringify(['pair', ip, username.toLocaleLowerCase()]));

  // Charge unknown usernames too, before lookup. The IP-wide quota bounds the
  // number of pair rows created by username spraying and is NOT reset on login.
  const { data: allowed, error: limitError } = await admin.rpc('consume_username_login_attempt', {
    p_ip_hash: ipHash,
    p_identifier_hash: identifierHash,
  });
  if (limitError) return response({ ok: false, code: 'unavailable' }, 503);
  if (allowed !== true) return response({ ok: false, code: 'rate_limited' });

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
  if (!email || error || !data.session) {
    if (email && /email not confirmed/i.test(error?.message || '')) {
      return credentialFailure('email_not_confirmed');
    }
    return credentialFailure();
  }

  // Only this IP/account pair is reset; success must not reset the spray limit.
  await admin.rpc('clear_username_login_attempts', { p_identifier_hash: identifierHash });
  return response({ ok: true, session: data.session });
}
