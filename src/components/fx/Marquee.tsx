import './fx.css';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * 跑马灯（Marquee）：实现思路来自 Magic UI 的 Marquee（MIT），用站内自研 CSS 重写——
 * 内容重复排布成多份，整份用 CSS 平移循环滚动；无 Tailwind、无新依赖。
 * Copyright (c) Magic UI. 许可全文见 THIRD_PARTY_NOTICES.md。
 *
 * 减弱动效：prefers-reduced-motion 时动画停止，只留第一份内容，可横向滑动查看。
 * 无障碍：重复副本 aria-hidden + inert，不进 Tab 顺序、不重复朗读。
 */
interface MarqueeProps {
  className?: string;
  /** 反向滚动，默认 false */
  reverse?: boolean;
  /** 悬停时暂停，默认 false */
  pauseOnHover?: boolean;
  /** 完整滚动一圈的时长（秒），默认 40 */
  duration?: number;
  /** 内容重复份数，默认 4（保证循环不断档） */
  repeat?: number;
  children: ReactNode;
}

export default function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  duration = 40,
  repeat = 4,
  children,
}: MarqueeProps) {
  // 手机上没有悬停：手指按住跑马灯时停住，松开继续滚，方便把一行公告读完。
  const [touchPaused, setTouchPaused] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Pause the CSS loop while this marquee is outside the viewport. This avoids
  // spending compositor work on announcements/cards the user cannot currently see.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { rootMargin: '80px 0px', threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const style = { '--fx-marquee-duration': `${duration}s` } as CSSProperties;
  const copies = Math.max(2, Math.min(8, Math.round(repeat)));
  return (
    <div
      ref={rootRef}
      className={['fx-marquee', !isInView ? 'fx-marquee-offscreen' : '', pauseOnHover ? 'fx-marquee-pause' : '', touchPaused ? 'fx-marquee-touch-paused' : '', className].filter(Boolean).join(' ')}
      style={style}
      onTouchStart={() => setTouchPaused(true)}
      onTouchEnd={() => setTouchPaused(false)}
      onTouchCancel={() => setTouchPaused(false)}
    >
      {Array.from({ length: copies }, (_, i) => (
        <div
          key={i}
          className="fx-marquee-copy"
          aria-hidden={i > 0 || undefined}
          inert={i > 0 || undefined}
          style={reverse ? { animationDirection: 'reverse' } : undefined}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
