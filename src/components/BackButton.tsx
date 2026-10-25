import type { ReactNode } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

// 有上一页就回上一页；直接打开链接进来、没有上一页时去 fallback
export function goBackOr(nav: NavigateFunction, fallback: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === 'number' && idx > 0) nav(-1);
  else nav(fallback);
}

export default function BackButton({ fallback, className = 'backbtn', children = '← 返回' }: {
  fallback: string;
  className?: string;
  children?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <button className={className} onClick={() => goBackOr(nav, fallback)}>
      {children}
    </button>
  );
}
