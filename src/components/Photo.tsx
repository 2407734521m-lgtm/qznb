import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAvatar } from '../lib/useAvatar';

// 列表与详情页使用相同的 layoutId，实现照片共享元素过渡（FLIP，只动 transform）。
export default function Photo({ id, path, name }: { id: string; path?: string | null; name: string }) {
  const url = useAvatar(path);
  const [bad, setBad] = useState(false);
  const reduce = useReducedMotion();
  return (
    <motion.div layoutId={`photo-${id}`} className="photo"
      transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}>
      {url && !bad
        ? <img src={url} alt={name} loading="lazy" onError={() => setBad(true)} />
        : <span>{name.slice(0, 1).toUpperCase()}</span>}
    </motion.div>
  );
}
