// 全站壁纸偏好（localStorage）：登录后的壁纸 onboarding 与 App 背景共用
export type WpKind = 'img' | 'grad';
export interface Wallpaper { src: string; kind: WpKind; blur: number; dark: number; }

const KEY = 'ca_wallpaper_v1';
const ONBOARDED = 'ca_wallpaper_onboarded';

export const GRADIENTS: string[] = [
  'linear-gradient(135deg,#1b1e3f,#5b2c6f)',
  'linear-gradient(135deg,#0f2027,#2c5364)',
  'linear-gradient(135deg,#3a1c71,#d76d77)',
  'linear-gradient(135deg,#141e30,#243b55)',
];

export function getWallpaper(): Wallpaper {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const w = JSON.parse(raw);
      if (w && typeof w.src === 'string') return { blur: 7, dark: 58, kind: 'img', ...w };
    }
  } catch { /* ignore */ }
  return { src: 'default', kind: 'img', blur: 7, dark: 58 };
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
