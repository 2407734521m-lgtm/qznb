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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, code: 'invalid_request' }, 405);

  let payload: { username?: unknown; password?: unknown };
  try { payload = await req.json(); } catch { return response({ ok: false, code: 'invalid_request' }, 400); }

  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!username || username.length > 30 || !password || password.length > 256) {
    return response({ ok: false, code: 'invalid_request' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return response({ ok: false, code: 'unavailable' }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const identifierHash = await hashIdentifier(username);

  const { data: allowed, error: limitError } = await admin.rpc('consume_username_login_attempt', {
    p_identifier_hash: identifierHash,
  });
  if (limitError) return response({ ok: false, code: 'unavailable' }, 503);
  if (allowed !== true) return response({ ok: false, code: 'rate_limited' });

  // Resolve the private email only inside this server function. Never include it
  // in an error response or return it to the browser.
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .limit(2);
  if (profileError) return response({ ok: false, code: 'unavailable' }, 503);
  if (!profiles || profiles.length !== 1) return response({ ok: false, code: 'invalid_credentials' });

  const { data: emails, error: emailError } = await admin
    .from('profile_emails')
    .select('email')
    .eq('profile_id', profiles[0].id)
    .limit(2);
  if (emailError) return response({ ok: false, code: 'unavailable' }, 503);
  if (!emails || emails.length !== 1 || !emails[0].email) {
    return response({ ok: false, code: 'invalid_credentials' });
  }

  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.signInWithPassword({
    email: emails[0].email,
    password,
  });

  if (error || !data.session) {
    if (/email not confirmed/i.test(error?.message || '')) {
      return response({ ok: false, code: 'email_not_confirmed' });
    }
    return response({ ok: false, code: 'invalid_credentials' });
  }

  await admin.rpc('clear_username_login_attempts', { p_identifier_hash: identifierHash });
  return response({ ok: true, session: data.session });
});
