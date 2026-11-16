import { useEffect, useRef, useState } from 'react';
import './fx.css';
import type { CSSProperties } from 'react';

export interface BorderBeamProps {
  /** Full revolution duration in seconds. */
  duration?: number;
  /** Muted beam color; defaults to the site's neutral silver tone. */
  color?: string;
  /** Beam border width in pixels. */
  borderWidth?: number;
  className?: string;
}

/**
 * A restrained border highlight inspired by Magic UI's BorderBeam.
 * This local CSS implementation avoids the upstream Tailwind / Motion runtime
 * requirements, respects prefers-reduced-motion, and pauses outside the viewport
 * or while the document is hidden.
 */
export default function BorderBeam({
  duration = 8,
  color = 'rgba(126, 143, 162, .56)',
  borderWidth = 1,
  className,
}: BorderBeamProps) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const inViewportRef = useRef(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const syncActivity = () => {
      setIsActive(inViewportRef.current && !document.hidden);
    };

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        inViewportRef.current = Boolean(entry?.isIntersecting);
        syncActivity();
      }, { rootMargin: '80px' });
      observer.observe(element);
    } else {
      // Older browsers keep the original visible-page behavior.
      inViewportRef.current = true;
      syncActivity();
    }

    document.addEventListener('visibilitychange', syncActivity);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', syncActivity);
    };
  }, []);

  const style = {
    '--fx-border-beam-duration': `${Math.max(4, duration)}s`,
    '--fx-border-beam-color': color,
    '--fx-border-beam-width': `${Math.max(0.5, borderWidth)}px`,
  } as CSSProperties;

  return (
    <span
      ref={elementRef}
      aria-hidden="true"
      className={['fx-border-beam', isActive && 'fx-border-beam-active', className].filter(Boolean).join(' ')}
      style={style}
    />
  );
}
