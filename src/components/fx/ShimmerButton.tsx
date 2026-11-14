import './fx.css';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

/**
 * 微光按钮（Shimmer Button）：实现思路来自 Magic UI 的 ShimmerButton（MIT），用站内自研
 * CSS 重写——按钮面沿用站内主按钮 button.pri 的渐变，一道微光沿边框匀速绕行；
 * 无 Tailwind、无新依赖。
 * Copyright (c) Magic UI. 许可全文见 THIRD_PARTY_NOTICES.md。
 *
 * 只用在主按钮上（发帖、提交类），不要满屏用。
 * 减弱动效：prefers-reduced-motion 时微光停掉，只留主按钮本身；禁用态微光同样停掉。
 */
export interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 微光颜色，默认 rgba(255,255,255,.8) */
  shimmerColor?: string;
  /** 微光绕一圈的时长，默认 '3s' */
  shimmerDuration?: string;
  /** 圆角，默认 14px（与站内 button.pri 一致） */
  borderRadius?: string;
  children?: ReactNode;
}

export default function ShimmerButton({
  shimmerColor = 'rgba(255,255,255,.8)',
  shimmerDuration = '3s',
  borderRadius = '14px',
  className,
  style,
  children,
  disabled,
  ...props
}: ShimmerButtonProps) {
  const vars = {
    '--fx-shimmer-color': shimmerColor,
    '--fx-shimmer-duration': shimmerDuration,
    '--fx-shimmer-radius': borderRadius,
  } as CSSProperties;
  return (
    <button
      type="button"
      className={['fx-shimmer-btn', className].filter(Boolean).join(' ')}
      style={{ ...vars, ...style }}
      disabled={disabled}
      {...props}
    >
      <span className="fx-shimmer-ring" aria-hidden="true" />
      <span className="fx-shimmer-label">{children}</span>
    </button>
  );
}
