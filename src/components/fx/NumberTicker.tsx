import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import './fx.css';

/**
 * 数字滚动（NumberTicker）：实现思路来自 Magic UI 的 NumberTicker（MIT），用站里已有的
 * framer-motion 弹簧重写——进入视口后从起始值滚动到终值；无 Tailwind、无新依赖。
 * Copyright (c) Magic UI. 许可全文见 THIRD_PARTY_NOTICES.md。
 *
 * 减弱动效：prefers-reduced-motion 时不滚动，直接显示终值。
 * 管理后台的 AdminNumberTicker 只是这层薄壳（见 ../admin/AdminNumberTicker.tsx），
 * 不要再另写一份滚动逻辑。
 */
interface NumberTickerProps extends ComponentPropsWithoutRef<'span'> {
  value: number;
  startValue?: number;
  direction?: 'up' | 'down';
  delay?: number;
  decimalPlaces?: number;
}

export default function NumberTicker({
  value,
  startValue = 0,
  direction = 'up',
  delay = 0,
  decimalPlaces = 0,
  className,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(direction === 'down' ? value : startValue);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: '0px' });

  useEffect(() => {
    if (!isInView) return undefined;
    const target = direction === 'down' ? startValue : value;

    if (reduceMotion) {
      motionValue.jump(target);
      springValue.jump(target);
      if (ref.current) {
        ref.current.textContent = new Intl.NumberFormat('zh-CN', {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        }).format(target);
      }
      return undefined;
    }

    const timer = window.setTimeout(() => motionValue.set(target), delay * 1000);
    return () => window.clearTimeout(timer);
  }, [delay, decimalPlaces, direction, isInView, motionValue, reduceMotion, springValue, startValue, value]);

  useEffect(() => springValue.on('change', latest => {
    if (!ref.current) return;
    const formatted = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(Number(latest.toFixed(decimalPlaces)));
    ref.current.textContent = formatted;
  }), [decimalPlaces, springValue]);

  const initialValue = direction === 'down' ? value : startValue;
  const initialText = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(initialValue);

  const targetText = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value);

  return (
    <span
      ref={ref}
      className={['fx-number-ticker', className].filter(Boolean).join(' ')}
      aria-label={targetText}
      {...props}
    >
      {initialText}
    </span>
  );
}
