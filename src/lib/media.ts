import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** 私有 bucket 的 1 小时签名链接。path 为空或已是 http(s) 时直接返回。 */
export function useSignedUrl(bucket: string, path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    setUrl(null);
    if (!path) return;
    if (/^https?:\/\//.test(path)) { setUrl(path); return; }
    supabase.storage.from(bucket).createSignedUrl(path, 3600)
      .then(({ data }) => { if (!off) setUrl(data?.signedUrl ?? null); })
      .catch(() => {});
    return () => { off = true; };
  }, [bucket, path]);
  return url;
}

/** 上传文件到私有 bucket 的"自己的文件夹"，返回 storage path。 */
export async function uploadMedia(bucket: string, file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined, upsert: false,
  });
  if (error) throw error;
  return path;
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
