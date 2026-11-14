// Same-origin HTTPS proxy only. Never return this secret in JSON or JS storage.
export const DEVICE_COOKIE = '__Host-qznb-login-device';
export const DEVICE_TTL = 30 * 86400;
export function cookieOriginAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  // Browser-controlled Fetch Metadata prevents sibling-origin login CSRF too.
  // Missing metadata fails closed for device features, not ordinary login.
  if (!origin || req.headers.get('sec-fetch-site') !== 'same-origin') return false;
  const allowed = (Deno.env.get('USERNAME_LOGIN_COOKIE_ORIGINS') || '').split(',').map(s => s.trim());
  try { return new URL(origin).protocol === 'https:' && allowed.includes(origin); } catch { return false; }
}
export function deviceSecret(req: Request): string {
  if (!cookieOriginAllowed(req)) return '';
  const values = (req.headers.get('cookie') || '').split(';').map(s => s.trim())
    .filter(s => s.startsWith(DEVICE_COOKIE + '='));
  if (values.length !== 1) return '';
  const token = values[0].slice(DEVICE_COOKIE.length + 1);
  return /^[0-9a-f]{64}$/.test(token) ? token : '';
}
export function deviceCookie(token: string, remove = false): string {
  return `${DEVICE_COOKIE}=${remove ? '' : token}; Path=/; Max-Age=${remove ? 0 : DEVICE_TTL}; Secure; HttpOnly; SameSite=Strict`;
}
