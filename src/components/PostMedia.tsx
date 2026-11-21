import { useReducedMotion } from 'framer-motion';
import BlurImg from './fx/BlurImg';

/** 动态配图是视频（.mp4/.webm/.mov/.m4v，或 video.twimg.com 直链）时按动图处理：静音循环自动播放。 */
export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(clean)) return true;
  if (/^https?:\/\/video\.twimg\.com\//.test(url)) return true;
  return false;
}

export default function PostMedia({ url, className = '', style }: {
  url?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  if (!url) return null;
  if (isVideoUrl(url)) {
    return (
      <video
        className={className || 'bdimg'}
        style={{ width: '100%', borderRadius: 12, display: 'block', ...style }}
        src={url}
        autoPlay={reduce ? false : true}
        loop
        muted
        playsInline
        controls={reduce ? true : undefined}
        preload="metadata"
      />
    );
  }
  return <BlurImg className={className || 'bdimg'} src={url} alt="" style={style} />;
}
