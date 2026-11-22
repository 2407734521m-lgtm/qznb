import { useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import BlurImg from './fx/BlurImg';
import { twimgVariants } from '../lib/responsiveImage';

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
  // 只靠 autoPlay 属性在部分手机浏览器/WebView 里播不起来：这里直接把 muted 写进
  // 元素属性再调 play()，播不起来也不报错；点视频可以暂停/继续。
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    if (!el || reduce) return;
    el.muted = true;
    const result = el.play();
    if (result) result.catch(() => {});
  }, [reduce]);
  if (!url) return null;
  if (isVideoUrl(url)) {
    return (
      <video
        ref={videoRef}
        className={className || 'bdimg'}
        style={{ width: '100%', borderRadius: 12, display: 'block', ...style }}
        src={url}
        autoPlay={reduce ? false : true}
        loop
        muted
        playsInline
        controls={reduce ? true : undefined}
        preload="metadata"
        onClick={event => {
          const video = event.currentTarget;
          if (video.paused) void video.play();
          else video.pause();
        }}
      />
    );
  }
  // 推特原图直链按显示尺寸取小图：卡片手机上只显示约 332px，没必要拉 1200px 原图。
  const variants = twimgVariants(url);
  return (
    <BlurImg
      className={className || 'bdimg'}
      src={variants?.src ?? url}
      srcSet={variants?.srcSet}
      sizes={variants?.sizes}
      alt=""
      style={style}
    />
  );
}
