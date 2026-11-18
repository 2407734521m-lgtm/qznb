export type AdminWallpaper =
  | { type: 'none' }
  | { type: 'preset'; id: 'warm-light' | 'soft-gray' | 'ivory' }
  | { type: 'image'; url: string; path: string };

export const ADMIN_WALLPAPER_KEY = 'admin_wallpaper';

export const ADMIN_WALLPAPER_PRESETS: {
  id: 'warm-light' | 'soft-gray' | 'ivory';
  label: string;
  description: string;
  background: string;
}[] = [
  {
    id: 'warm-light',
    label: '柔和暖光',
    description: '白灰底色与轻微暖黄色',
    background: 'radial-gradient(ellipse at 82% 12%, rgba(243, 204, 127, .42), transparent 38%), radial-gradient(ellipse at 8% 88%, rgba(208, 220, 232, .42), transparent 42%), linear-gradient(140deg, #fbfcfc 0%, #f1f3f5 100%)',
  },
  {
    id: 'soft-gray',
    label: '雾灰',
    description: '安静的浅灰层次',
    background: 'radial-gradient(ellipse at 75% 18%, rgba(210, 220, 228, .48), transparent 42%), linear-gradient(145deg, #f9fafb 0%, #e9edf0 100%)',
  },
  {
    id: 'ivory',
    label: '柔白',
    description: '接近纯白的细腻暖调',
    background: 'radial-gradient(ellipse at 88% 8%, rgba(245, 226, 188, .34), transparent 38%), linear-gradient(145deg, #fffefd 0%, #f6f5f1 100%)',
  },
];

function safeHttpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function parseAdminWallpaper(value: unknown): AdminWallpaper {
  let candidate: unknown = value;
  if (typeof value === 'string') {
    try { candidate = JSON.parse(value); } catch { return { type: 'none' }; }
  }
  if (!candidate || typeof candidate !== 'object') return { type: 'none' };
  const data = candidate as Record<string, unknown>;
  if (data.type === 'preset' && ADMIN_WALLPAPER_PRESETS.some(item => item.id === data.id)) {
    return { type: 'preset', id: data.id as 'warm-light' | 'soft-gray' | 'ivory' };
  }
  if (data.type === 'image' && typeof data.url === 'string') {
    const url = safeHttpsUrl(data.url);
    if (!url) return { type: 'none' };
    return {
      type: 'image',
      url,
      path: typeof data.path === 'string' ? data.path : '',
    };
  }
  return { type: 'none' };
}

export function getAdminWallpaperBackground(wallpaper: AdminWallpaper): string | null {
  if (wallpaper.type === 'preset') {
    return ADMIN_WALLPAPER_PRESETS.find(item => item.id === wallpaper.id)?.background ?? null;
  }
  if (wallpaper.type === 'image') {
    // The URL was validated as HTTPS before it reaches CSS.
    return `linear-gradient(rgba(255, 255, 255, .48), rgba(247, 248, 250, .60)), url(${JSON.stringify(wallpaper.url)})`;
  }
  return null;
}
