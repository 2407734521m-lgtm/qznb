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
 * requirements and respects prefers-reduced-motion.
 */
export default function BorderBeam({
  duration = 8,
  color = 'rgba(126, 143, 162, .56)',
  borderWidth = 1,
  className,
}: BorderBeamProps) {
  const style = {
    '--fx-border-beam-duration': `${Math.max(4, duration)}s`,
    '--fx-border-beam-color': color,
    '--fx-border-beam-width': `${Math.max(0.5, borderWidth)}px`,
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={['fx-border-beam', className].filter(Boolean).join(' ')}
      style={style}
    />
  );
}
