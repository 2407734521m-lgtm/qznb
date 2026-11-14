import type { ComponentPropsWithoutRef } from 'react';
import NumberTicker from '../fx/NumberTicker';

/**
 * 管理后台数字滚动：沿用 Magic UI NumberTicker 的改编实现（见 ../fx/NumberTicker），
 * 这里只保留 admin-number-ticker 这一层壳与原有 props，不再另写一份滚动逻辑。
 * Copyright (c) Magic UI. See THIRD_PARTY_NOTICES.md.
 */
interface AdminNumberTickerProps extends ComponentPropsWithoutRef<'span'> {
  value: number;
  startValue?: number;
  direction?: 'up' | 'down';
  delay?: number;
  decimalPlaces?: number;
}

export default function AdminNumberTicker({ className, ...props }: AdminNumberTickerProps) {
  return (
    <NumberTicker
      className={['admin-number-ticker', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
