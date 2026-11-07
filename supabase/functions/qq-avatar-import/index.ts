import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const QQ_CDN_HOSTS = new Set(['q1.qlogo.cn', 'q2.qlogo.cn', 'q3.qlogo.cn', 'q4.qlogo.cn']);
const ALLOWED_ORIGINS = new Set([
  'https://qianzhi.pw',
  'https://www.qianzhi.pw',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function detectImageType(bytes: Uint8Array): { extension: string; contentType: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return { extension: 'png', contentType: 'image/png' };
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return { extension: 'webp', contentType: 'image/webp' };
  return null;
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array | null; tooLarge: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: null, tooLarge: false };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { bytes: null, tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, tooLarge: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { ok: false, code: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(req, { ok: false, code: 'unauthorized' }, 401);

  const requestLength = Number(req.headers.get('content-length') ?? 0);
  if (requestLength > 1024) return json(req, { ok: false, code: 'request_too_large' }, 413);

  let payload: { qq?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json(req, { ok: false, code: 'invalid_request' }, 400);
  }

  const qq = typeof payload.qq === 'string' ? payload.qq : '';
  if (!/^[1-9]\d{4,10}$/.test(qq)) {
    return json(req, { ok: false, code: 'invalid_request' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(req, { ok: false, code: 'service_unavailable' }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  const user = userData.user;
  if (authError || !user?.id || !user.email || !user.email_confirmed_at) {
    return json(req, { ok: false, code: 'unauthorized' }, 401);
  }

  // Only the verified numeric QQ mailbox belonging to this account can be imported.
  const mailbox = user.email.trim().toLowerCase().match(/^([1-9]\d{4,10})@qq\.com$/);
  if (!mailbox || mailbox[1] !== qq) {
    return json(req, { ok: false, code: 'mailbox_mismatch' }, 403);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('avatar_path')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return json(req, { ok: false, code: 'profile_unavailable' }, 503);
  }

  // Idempotency: once the QQ avatar is saved for this user, retries reuse the same file.
  const path = `${user.id}/qq-avatar`;
  if (profile.avatar_path === path) {
    return json(req, { ok: true, path, cached: true });
  }

  try {
    const upstream = await fetch(
      `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=640`,
      {
        headers: { Accept: 'image/jpeg,image/png,image/webp' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!upstream.ok) return json(req, { ok: false, code: 'avatar_unavailable' }, 502);

    // Follow only redirects that remain on Tencent's QQ avatar CDN hosts.
    const finalUrl = new URL(upstream.url);
    if (finalUrl.protocol !== 'https:' || !QQ_CDN_HOSTS.has(finalUrl.hostname)) {
      return json(req, { ok: false, code: 'untrusted_avatar_host' }, 502);
    }

    const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_AVATAR_BYTES) {
      return json(req, { ok: false, code: 'avatar_too_large' }, 413);
    }

    const { bytes, tooLarge } = await readLimitedBody(upstream, MAX_AVATAR_BYTES);
    if (tooLarge) return json(req, { ok: false, code: 'avatar_too_large' }, 413);
    if (!bytes || bytes.byteLength === 0) {
      return json(req, { ok: false, code: 'empty_avatar' }, 502);
    }

    const imageType = detectImageType(bytes);
    if (!imageType) return json(req, { ok: false, code: 'invalid_avatar_image' }, 502);

    const { error: uploadError } = await admin.storage.from('avatars').upload(path, bytes, {
      contentType: imageType.contentType,
      cacheControl: '31536000',
      upsert: true,
    });
    if (uploadError) return json(req, { ok: false, code: 'avatar_save_failed' }, 502);

    const { error: updateError } = await admin
      .from('profiles')
      .update({ avatar_path: path })
      .eq('id', user.id);
    if (updateError) {
      await admin.storage.from('avatars').remove([path]);
      return json(req, { ok: false, code: 'profile_save_failed' }, 502);
    }

    const oldPath = profile.avatar_path;
    if (typeof oldPath === 'string' && oldPath.startsWith(`${user.id}/`) && oldPath !== path) {
      await admin.storage.from('avatars').remove([oldPath]);
    }

    return json(req, { ok: true, path, cached: false });
  } catch (error) {
    // Avoid exposing the email, QQ number, upstream response, or server secrets.
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return json(req, { ok: false, code: timedOut ? 'avatar_timeout' : 'avatar_import_failed' }, 502);
  }
});
