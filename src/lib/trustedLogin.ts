import { supabaseBaseUrl } from './supabase';
// HttpOnly cookies only work through the site's HTTPS same-origin API proxy.
// Cross-origin previews intentionally get no weaker localStorage fallback.
export const trustedLoginAvailable = (() => {
  try { return import.meta.env.VITE_USERNAME_TRUSTED_DEVICE_ENABLED === 'true' && window.location.protocol === 'https:' && new URL(supabaseBaseUrl || '').origin === window.location.origin; }
  catch { return false; }
})();
