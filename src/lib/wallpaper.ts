// 全站壁纸偏好（localStorage）：登录后的壁纸 onboarding 与 App 背景共用
export type WpKind = 'img' | 'grad';
export interface Wallpaper { src: string; kind: WpKind; blur: number; dark: number; }

const KEY = 'ca_wallpaper_v1';
const ONBOARDED = 'ca_wallpaper_onboarded';

const DEFAULT_DEEP_BLUE_TEAL =
  'radial-gradient(ellipse at 18% 12%, rgba(20,184,166,.52), transparent 42%), radial-gradient(ellipse at 84% 26%, rgba(59,130,246,.34), transparent 46%), radial-gradient(ellipse at 72% 88%, rgba(13,148,136,.20), transparent 40%), linear-gradient(135deg,#06101f 0%,#0a1c32 48%,#071923 100%)';

export const GRADIENTS: string[] = [
  DEFAULT_DEEP_BLUE_TEAL,
  'radial-gradient(ellipse at 18% 15%,rgba(20,184,166,.42),transparent 42%),linear-gradient(135deg,#071321,#0f2940)',
  'linear-gradient(135deg,#0f2027,#2c5364)',
  'linear-gradient(135deg,#141e30,#243b55)',
];

export function getWallpaper(): Wallpaper {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const w = JSON.parse(raw);
      if (w && typeof w.src === 'string') {
        // Upgrade the old built-in default without overriding a wallpaper the user chose.
        if (w.src === 'default') return { src: DEFAULT_DEEP_BLUE_TEAL, kind: 'grad', blur: 0, dark: 20 };
        return { blur: 7, dark: 58, kind: 'img', ...w };
      }
    }
  } catch { /* ignore */ }
  return { src: DEFAULT_DEEP_BLUE_TEAL, kind: 'grad', blur: 0, dark: 20 };
}

export function setWallpaper(w: Wallpaper) {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('ca:wallpaper'));
}

export function isOnboarded() {
  try { return localStorage.getItem(ONBOARDED) === '1'; } catch { return true; }
}
export function markOnboarded() {
  try { localStorage.setItem(ONBOARDED, '1'); } catch { /* ignore */ }
}
