import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function imageExtension(contentType: string, bytes: Uint8Array): string | null {
  if (contentType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (
    contentType === 'image/png' &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) return 'png';
  if (
    contentType === 'image/webp' &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'webp';
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { ok: false, code: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(req, { ok: false, code: 'unauthorized' }, 401);

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

  // A user can import only the public avatar belonging to their own verified QQ mailbox.
  const mailbox = user.email.trim().toLowerCase().match(/^([1-9]\d{4,10})@qq\.com$/);
  if (!mailbox || mailbox[1] !== qq) {
    return json(req, { ok: false, code: 'mailbox_mismatch' }, 403);
  }

  try {
    const upstream = await fetch(
      `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=640`,
      { headers: { Accept: 'image/jpeg,image/png,image/webp' }, redirect: 'follow' },
    );
    if (!upstream.ok) return json(req, { ok: false, code: 'avatar_unavailable' }, 502);

    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
    if (declaredLength > 2 * 1024 * 1024) {
      return json(req, { ok: false, code: 'avatar_too_large' }, 413);
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) {
      return json(req, { ok: false, code: 'avatar_too_large_or_empty' }, 413);
    }
    const extension = imageExtension(contentType, bytes);
    if (!extension) return json(req, { ok: false, code: 'invalid_avatar_image' }, 502);

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

    const path = `${user.id}/qq-avatar-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from('avatars').upload(path, bytes, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
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

    return json(req, { ok: true, path });
  } catch {
    // Do not log or echo the email address or QQ number.
    return json(req, { ok: false, code: 'avatar_import_failed' }, 502);
  }
});
