import type { CSSProperties } from 'react';

interface BrandMarkProps {
  size?: number;
  /** walnut：棕底奶油字（默认）；cream：奶油底棕字，用于深色背景 */
  tone?: 'walnut' | 'cream';
  className?: string;
  style?: CSSProperties;
  /** 单独出现时填写，作为无障碍名称；旁边已有文字时留空 */
  title?: string;
}

/** Class Memory 的 C+M 字母标：C 是班级，金色圆点是被留住的记忆，M 是 Memory。 */
export default function BrandMark({ size = 40, tone = 'walnut', className, style, title }: BrandMarkProps) {
  const walnut = tone === 'walnut';
  const tile = walnut ? '#94664f' : '#fff7ec';
  const ink = walnut ? '#fff7ec' : '#94664f';
  const dot = walnut ? '#f0c27b' : '#e0a040';
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
      <path d="M52.9 43.5A21 21 0 1 0 52.9 76.5" fill="none" stroke={ink} strokeWidth="10" strokeLinecap="round" />
      <circle cx="40" cy="60" r="5" fill={dot} />
      <path d="M70 78V42L86 64L102 42V78" fill="none" stroke={ink} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
