import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { withRetry } from './retry';

/** 私有 bucket 的签名 URL 缓存；同一资源在有效期内不重复签名。 */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedUrls(bucket: string, paths: Array<string | null | undefined>) {
  const unique = [...new Set(paths.filter((p): p is string => !!p && !/^https?:\/\//.test(p)))];
  const result: Record<string, string> = {};
  const missing: string[] = [];
  const now = Date.now();
  unique.forEach(path => {
    const cached = signedUrlCache.get(bucket + ':' + path);
    if (cached && cached.expiresAt > now + 60_000) result[path] = cached.url;
    else missing.push(path);
  });
  if (missing.length) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, 3600);
    if (error) throw error;
    (data ?? []).forEach(item => {
      if (!item.path || !item.signedUrl) return;
      result[item.path] = item.signedUrl;
      signedUrlCache.set(bucket + ':' + item.path, { url: item.signedUrl, expiresAt: now + 3_500_000 });
    });
  }
  paths.forEach(path => { if (path && /^https?:\/\//.test(path)) result[path] = path; });
  return result;
}

/** 列表场景批量签名，避免每张图片各发一次请求。 */
export function useSignedUrls(bucket: string, paths: Array<string | null | undefined>) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = [...new Set(paths.filter(Boolean) as string[])].sort().join('|');
  useEffect(() => {
    let alive = true;
    const current = key ? key.split('|') : [];
    if (!current.length) { setUrls({}); return; }
    getSignedUrls(bucket, current).then(value => { if (alive) setUrls(value); }).catch(() => {});
    return () => { alive = false; };
  }, [bucket, key]);
  return urls;
}

/** 单张图片兼容接口；也复用批量签名缓存。 */
export function useSignedUrl(bucket: string, path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path) return;
    if (/^https?:\/\//.test(path)) { setUrl(path); return; }
    getSignedUrls(bucket, [path]).then(value => { if (alive) setUrl(value[path] ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [bucket, path]);
  return url;
}

const uploadMimeTypes: Record<string, readonly string[]> = {
  media: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v', 'video/3gpp',
  ],
  videos: ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v', 'video/3gpp'],
  'chat-media': [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/mpeg', 'audio/x-m4a',
  ],
};

/** 上传文件到私有 bucket 的"自己的文件夹"，返回 storage path。 */
export async function uploadMedia(bucket: string, file: File, folder?: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const allowedTypes = uploadMimeTypes[bucket];
  if (allowedTypes && !allowedTypes.includes(file.type)) {
    throw new Error('文件格式不受支持，请选择常见图片、MP4/WebM 视频或支持的聊天音频格式。');
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const r = await withRetry(async () => {
    const path = `${folder ? `${folder.replace(/^\/+|\/+$/g, '')}/` : `${user.id}/`}${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || undefined, upsert: false,
    });
    return { path, error };
  });
  if (r.error) throw r.error;
  return r.path;
}

/** 把图片在前端压到合适尺寸再上传（省流量、省空间）。 */
export function downscaleImage(file: File, maxDim = 1280, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (scale >= 1) { URL.revokeObjectURL(url); resolve(file); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        URL.revokeObjectURL(url);
        resolve(b ? new File([b], 'photo.jpg', { type: 'image/jpeg' }) : file);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
