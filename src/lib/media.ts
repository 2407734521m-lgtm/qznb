import { useEffect, useState } from 'react';
import { supabase, supabaseBaseUrl, supabaseAnonKey } from './supabase';
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
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif',
    'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac', 'audio/mpeg', 'audio/x-m4a',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed', 'application/vnd.rar',
    'application/x-rar-compressed', 'application/x-7z-compressed',
    'application/octet-stream',
  ],
};

export type MediaUploadIslandEvent = {
  id: string;
  phase: 'start' | 'progress' | 'complete' | 'error';
  label: string;
  progress: number | null;
};

let uploadActivitySequence = 0;

function uploadActivityLabel(file: File) {
  if (file.type.startsWith('image/')) return '正在上传图片';
  if (file.type.startsWith('video/')) return '正在上传视频';
  if (file.type.startsWith('audio/')) return '正在上传音频';
  return '正在上传文件';
}

function emitUploadIslandEvent(detail: MediaUploadIslandEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MediaUploadIslandEvent>('qz-island-upload', { detail }));
}

async function trackMediaUpload<T>(
  file: File,
  upload: (reportProgress: (pct: number) => void) => Promise<T>,
  onProgress?: (pct: number) => void,
): Promise<T> {
  const id = 'media-upload-' + Date.now() + '-' + (++uploadActivitySequence);
  const label = uploadActivityLabel(file);
  emitUploadIslandEvent({ id, phase: 'start', label, progress: null });
  const reportProgress = (pct: number) => {
    const progress = Math.max(0, Math.min(100, Math.round(pct)));
    onProgress?.(progress);
    emitUploadIslandEvent({ id, phase: 'progress', label, progress });
  };
  try {
    const result = await upload(reportProgress);
    emitUploadIslandEvent({ id, phase: 'complete', label, progress: 100 });
    return result;
  } catch (error) {
    emitUploadIslandEvent({ id, phase: 'error', label, progress: null });
    throw error;
  }
}
/** 上传文件到私有 bucket 的"自己的文件夹"，返回 storage path。 */
export async function uploadMedia(bucket: string, file: File, folder?: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const allowedTypes = uploadMimeTypes[bucket];
  const mime = file.type || 'application/octet-stream';
  if (allowedTypes && !allowedTypes.includes(mime)) {
    throw new Error('文件格式不受支持，请选择常见图片、MP4/WebM 视频或支持的聊天音频格式。');
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return trackMediaUpload(file, async () => {
    const r = await withRetry(async () => {
      const prefix = folder ? folder.split('/').filter(Boolean).join('/') + '/' : user.id + '/';
      const path = prefix + Date.now() + '.' + ext;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: mime, upsert: false,
      });
      return { path, error };
    });
    if (r.error) throw r.error;
    return r.path;
  });
}
/** 带真实进度回调的上传：走 XMLHttpRequest 直传 Storage 接口，进度来自浏览器上传事件。 */
export async function uploadWithProgress(bucket: string, path: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('未登录');
  const url = `${supabaseBaseUrl}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    if (supabaseAnonKey) xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100))); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(100); resolve(); return; }
      let msg = `上传失败（${xhr.status}）`;
      try { const j = JSON.parse(xhr.responseText); if (j?.message) msg = j.message; } catch { /* 保持默认文案 */ }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    xhr.send(file);
  });
}

/** 与 uploadMedia 相同的校验与命名规则，但带进度回调（不自动重试，失败由界面提示重试）。 */
export async function uploadMediaWithProgress(bucket: string, file: File, folder: string | undefined, onProgress?: (pct: number) => void): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const allowedTypes = uploadMimeTypes[bucket];
  if (allowedTypes && !allowedTypes.includes(file.type)) {
    throw new Error('文件格式不受支持，请选择常见图片、MP4/WebM 视频或支持的聊天音频格式。');
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const prefix = folder ? folder.split('/').filter(Boolean).join('/') + '/' : user.id + '/';
  const path = prefix + Date.now() + '.' + ext;
  return trackMediaUpload(file, async reportProgress => {
    await uploadWithProgress(bucket, path, file, reportProgress);
    return path;
  }, onProgress);
}

export type MediaDownloadIslandEvent = {
  id: string;
  phase: 'start' | 'progress' | 'complete' | 'error';
  label: string;
  progress: number | null;
};

let downloadActivitySequence = 0;

function emitDownloadIslandEvent(detail: MediaDownloadIslandEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MediaDownloadIslandEvent>('qz-island-download', { detail }));
}

/**
 * Fetches a browser-readable HTTPS resource, reports real stream progress when
 * Content-Length is available, and saves it through a temporary object URL.
 * Browser-managed anchor downloads remain outside this API because the browser
 * does not expose their byte progress to page JavaScript.
 */
export async function downloadMediaWithProgress(
  resourceUrl: string,
  fileName: string,
  onProgress?: (progress: number | null) => void,
): Promise<void> {
  if (typeof window === 'undefined') throw new Error('下载只能在浏览器中开始');
  let parsed: URL;
  try {
    parsed = new URL(resourceUrl, window.location.href);
  } catch {
    throw new Error('下载链接无效');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('下载链接协议不受支持');
  }
  let storageOrigin = '';
  try { storageOrigin = new URL(supabaseBaseUrl).origin; } catch { /* The configured URL is validated during app startup. */ }
  if (parsed.origin !== window.location.origin && parsed.origin !== storageOrigin) {
    throw new Error('下载链接不属于本站或聊天存储服务');
  }
  if (parsed.protocol === 'http:' && parsed.origin !== window.location.origin) {
    throw new Error('跨站下载必须使用 HTTPS');
  }

  const safeName = Array.from(fileName || '下载文件')
    .filter(char => {
      const code = char.charCodeAt(0);
      return code !== 47 && code !== 92 && code >= 32 && code !== 127;
    })
    .join('')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .slice(0, 120) || '下载文件';
  const id = 'media-download-' + Date.now() + '-' + (++downloadActivitySequence);
  const label = '正在下载 ' + safeName.slice(0, 36);
  emitDownloadIslandEvent({ id, phase: 'start', label, progress: null });

  try {
    const response = await fetch(parsed.href, {
      method: 'GET',
      credentials: parsed.origin === window.location.origin ? 'same-origin' : 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('下载请求失败（' + response.status + '）');

    const contentLength = Number(response.headers.get('Content-Length'));
    const total = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;
    const chunks: BlobPart[] = [];
    let loaded = 0;

    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          const chunk = new Uint8Array(value.byteLength);
          chunk.set(value);
          chunks.push(chunk.buffer);
          loaded += value.byteLength;
          const progress = total === null ? null : Math.min(100, Math.round((loaded / total) * 100));
          onProgress?.(progress);
          emitDownloadIslandEvent({ id, phase: 'progress', label, progress });
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      const blob = await response.blob();
      chunks.push(await blob.arrayBuffer());
      loaded = blob.size;
      const progress = total === null ? null : 100;
      onProgress?.(progress);
      emitDownloadIslandEvent({ id, phase: 'progress', label, progress });
    }

    const blob = new Blob(chunks, { type: response.headers.get('Content-Type') || 'application/octet-stream' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);

    onProgress?.(100);
    emitDownloadIslandEvent({ id, phase: 'complete', label, progress: 100 });
  } catch (error) {
    emitDownloadIslandEvent({ id, phase: 'error', label, progress: null });
    if (error instanceof TypeError) {
      throw new Error('浏览器无法读取此下载链接的内容；请使用原始打开链接');
    }
    throw error instanceof Error ? error : new Error('下载失败');
  }
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

/**
 * 删除属于指定作者的 storage 文件（仅当 path 为该作者名下的相对路径时才删；
 * 绝对 URL / 空路径 / 非本人路径一律不动，返回 null；删失败返回错误信息）。
 */
export async function removeOwnedMedia(path: string | null | undefined, ownerId: string): Promise<string | null> {
  if (!path || path.startsWith('http://') || path.startsWith('https://') || !path.startsWith(`${ownerId}/`)) return null;
  try {
    const { error } = await supabase.storage.from('media').remove([path]);
    return error?.message ?? null;
  } catch (error) {
    return error instanceof Error ? error.message : '存储服务暂时不可用';
  }
}
