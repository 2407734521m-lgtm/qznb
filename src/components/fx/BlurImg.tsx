import { useCallback, useState } from 'react';
import './fx.css';

/**
 * 模糊到清晰（动效图鉴 01）：图片从 blur(14px) + 透明开始，
 * 加载完成后模糊程度和透明度一起回到正常，700ms cubic-bezier(0.16, 1, 0.3, 1)。
 * 已缓存的图片也能正确入场（ref 里检查 complete）。
 */
export default function BlurImg({ src, alt = '', className = '', style, loading = 'lazy', draggable, onError }: {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
  onError?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={`${className} fx-blur-in${loaded ? ' fx-in' : ''}`}
      style={style}
      loading={loading}
      decoding="async"
      draggable={draggable}
      onLoad={() => setLoaded(true)}
      onError={onError}
    />
  );
}
