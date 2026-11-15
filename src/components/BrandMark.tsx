import type { CSSProperties } from 'react';

interface BrandMarkProps {
  size?: number;
  /** walnut keeps the dark mark; cream uses the inverse white surface. */
  tone?: 'walnut' | 'cream';
  className?: string;
  style?: CSSProperties;
  /** Set only when the mark appears without adjacent brand text. */
  title?: string;
}

/** Minimal Q mark for the Qianzhi wordmark. */
export default function BrandMark({ size = 40, tone = 'walnut', className, style, title }: BrandMarkProps) {
  const dark = tone === 'walnut';
  const tile = dark ? '#1f2a3a' : '#ffffff';
  const ink = dark ? '#ffffff' : '#1f2a3a';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect width="120" height="120" rx="30" fill={tile} />
      <circle cx="56" cy="54" r="27" fill="none" stroke={ink} strokeWidth="10" />
      <path d="M75 74 94 94" fill="none" stroke={ink} strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}
