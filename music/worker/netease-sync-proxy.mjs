// NetEase cross-device sync proxy for the music site (music.qianzhi.pw).
//
// Same-origin routes /api/qz-sync/netease/{link,status,restore,unlink} forward to the
// radio Worker (radio.qianzhi.pw/api/dl/netease/*), which owns site auth, AES-GCM
// encryption (NETEASE_SYNC_KEY) and the netease_account_links table. This Worker holds
// no sync secrets and changes no radio behaviour: it only relays the site Authorization
// header and, for link, the NetEase cookie the browser already keeps in localStorage
// (sent in the POST body, forwarded as Cookie: mr_session=...).
// For restore, the plaintext cookie arrives in the radio Worker's Set-Cookie response
// header; the proxy decodes it into the JSON body for the same-origin frontend and
// strips the Set-Cookie header, so no mr_session cookie is planted on music.qianzhi.pw.
// The cookie value is never logged.

const RADIO_SYNC_BASE = 'https://radio.qianzhi.pw/api/dl/netease';
const ACTIONS = new Set(['link', 'status', 'restore', 'unlink']);
const METHODS = { link: 'POST', status: 'GET', restore: 'POST', unlink: 'DELETE' };
const UPSTREAM_TIMEOUT_MS = 25000;
const MAX_COOKIE_LENGTH = 8192;

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// The radio Worker returns the restored session as Set-Cookie headers. The
// session is chunked (mr_session_parts=N plus mr_session_0..N-1, each value
// percent-encoded), and the leading mr_session= header only clears the legacy
// single cookie, so it is always empty. A naive "first mr_session=" read
// returns '' and the frontend never receives the session, so every restore
// fails on the page even though the server side succeeded. Reassemble the
// chunks; fall back to a non-empty legacy single mr_session value.
export function mrSessionFromSetCookie(headers) {
  let values = [];
  try {
    if (typeof headers.getSetCookie === 'function') values = headers.getSetCookie();
  } catch (_) { /* fall through to get('set-cookie') */ }
  if (!values.length) {
    const single = headers.get('set-cookie');
    if (single) values = [single];
  }
  // Chunk values are percent-encoded, so they never contain ';', ',' or
  // whitespace; matching on the exact names is safe in both the array form
  // and the comma-joined single-header form.
  const text = values.join('\n');
  const partsMatch = text.match(/mr_session_parts=(\d+)/);
  const parts = partsMatch ? Number(partsMatch[1]) : 0;
  if (Number.isInteger(parts) && parts >= 1 && parts <= 8) {
    let encoded = '';
    for (let i = 0; i < parts; i++) {
      const chunk = text.match(new RegExp('mr_session_' + i + '=([^;\\s,]+)'));
      if (!chunk) return '';
      encoded += chunk[1];
    }
    if (!encoded) return '';
    try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
  }
  const single = text.match(/mr_session=([^;\s,]+)/);
  if (single && single[1]) {
    try { return decodeURIComponent(single[1]); } catch (_) { return single[1]; }
  }
  return '';
}

export async function handleNeteaseSync(request) {
  const url = new URL(request.url);
  const action = url.pathname.slice('/api/qz-sync/netease/'.length).split('/')[0] || '';
  if (!ACTIONS.has(action)) return jsonResponse({ code: 404, msg: 'Sync route not found' }, 404);
  if (request.method !== METHODS[action]) return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const authorization = request.headers.get('authorization') || '';
  let cookie = '';
  let confirm = false;
  if (action === 'link') {
    let body = {};
    try { body = await request.json(); } catch (_) { body = {}; }
    if (typeof body.cookie !== 'string' || !body.cookie || body.cookie.length > MAX_COOKIE_LENGTH) {
      return jsonResponse({ error: 'INVALID_COOKIE' }, 400);
    }
    cookie = body.cookie;
    confirm = body.confirm === true;
  }

  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (authorization) headers.authorization = authorization;
  if (action === 'link') headers.cookie = 'mr_session=' + encodeURIComponent(cookie);

  let upstream;
  try {
    upstream = await fetch(RADIO_SYNC_BASE + '/' + action, {
      method: METHODS[action],
      headers,
      body: action === 'link' ? JSON.stringify({ confirm }) : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (_) {
    return jsonResponse({ code: 502, msg: 'Sync service unavailable' }, 502);
  }

  let data = {};
  try { data = await upstream.json(); } catch (_) { data = { error: 'BAD_UPSTREAM_RESPONSE' }; }
  if (action === 'restore' && upstream.ok && data && data.restored === true) {
    const restoredCookie = mrSessionFromSetCookie(upstream.headers);
    if (restoredCookie) data = { ...data, cookie: restoredCookie };
  }
  return jsonResponse(data, upstream.status);
}
