import { useState } from 'react';
import { useSignedUrl } from '../lib/media';

// 通用照片：私有 bucket 用签名链接；无照片时显示名字首字。
// 共享元素过渡由调用方用 lib/transition.ts 的 FLIP 手动驱动。
export default function Photo({ id, path, name, bucket = 'avatars', className = '' }:
  { id: string; path?: string | null; name: string; bucket?: string; className?: string }) {
  const url = useSignedUrl(bucket, path);
  const [bad, setBad] = useState(false);
  return (
    <div className={`photo ${className}`} data-photo={id}>
      {url && !bad
        ? <img src={url} alt={name} loading="lazy" draggable={false} onError={() => setBad(true)} />
        : <span className="photo-fallback">{name.slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}
