import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

/**
 * Spring-based number counter adapted from Magic UI's NumberTicker.
 * Copyright (c) Magic UI. See THIRD_PARTY_NOTICES.md.
 */
interface AdminNumberTickerProps extends ComponentPropsWithoutRef<'span'> {
  value: number;
  startValue?: number;
  direction?: 'up' | 'down';
  delay?: number;
  decimalPlaces?: number;
}

export default function AdminNumberTicker({
  value,
  startValue = 0,
  direction = 'up',
  delay = 0,
  decimalPlaces = 0,
  className,
  ...props
}: AdminNumberTickerProps) {
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
      className={['admin-number-ticker', className].filter(Boolean).join(' ')}
      aria-label={targetText}
      {...props}
    >
      {initialText}
    </span>
  );
}
