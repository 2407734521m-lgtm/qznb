import { useEffect, useState } from 'react';
import { supabase } from './supabase';
// 私有 bucket：只用 1 小时有效的签名链接，不使用公开 URL。
export function useAvatar(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false; setUrl(null);
    if (path) supabase.storage.from('avatars').createSignedUrl(path, 3600)
      .then(({ data }) => { if (!off) setUrl(data?.signedUrl ?? null); });
    return () => { off = true; };
  }, [path]);
  return url;
}
