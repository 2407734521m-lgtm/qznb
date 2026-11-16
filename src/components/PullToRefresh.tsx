import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import './PullToRefresh.css';

/**
 * 下拉刷新（首页帖子墙 / 动态 / 发现页共用）。
 *
 * - 只在页面滚动到顶（window.scrollY === 0）时才接管下拉手势，其余情况
 *   一律放行给页面滚动，不和滚动打架。
 * - 下拉距离阻尼递减（dampPullDistance），刷新图标旋转角度跟随下拉进度；
 *   松手超过阈值触发 onRefresh，完成后弹簧回弹归位。
 * - 触摸走原生 touch 监听（touchmove 用 passive: false 才能在确认下拉后
 *   阻止原生滚动）；鼠标/触控笔走 pointer 监听（拖动本身不滚动页面），
 *   两者互斥，触摸不走 pointer 分支。
 * - prefers-reduced-motion 时不用弹簧：直接归位，旋转图标不转圈。
 */

export const PTR_TRIGGER = 64;
export const PTR_HOLD = 56;
const PTR_DAMP_SCALE = 96;

/** 下拉距离阻尼递减：拉得越远，每多拉一像素换来的位移越少，上限 96px。 */
export function dampPullDistance(raw: number): number {
  if (raw <= 0) return 0;
  return PTR_DAMP_SCALE * (1 - Math.exp(-raw / PTR_DAMP_SCALE));
}

/** 下拉进度 0..1：到触发阈值时为 1，图标转满一圈。 */
export function pullProgress(pulled: number): number {
  return Math.min(1, Math.max(0, pulled / PTR_TRIGGER));
}

type PtrStatus = 'idle' | 'pulling' | 'refreshing';

const STATUS_TEXT: Record<PtrStatus, string> = {
  idle: '',
  pulling: '下拉刷新',
  refreshing: '正在刷新',
};

export default function PullToRefresh({ onRefresh, disabled = false, className, children }: {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const pullY = useMotionValue(0);
  const iconRotate = useTransform(pullY, [0, PTR_TRIGGER], [0, 360]);
  const iconOpacity = useTransform(pullY, [0, 16], [0, 1]);
  const [status, setStatus] = useState<PtrStatus>('idle');

  const statusRef = useRef(status);
  const onRefreshRef = useRef(onRefresh);
  const disabledRef = useRef(disabled);
  const reduceRef = useRef(reduceMotion);
  const gestureRef = useRef<{ startY: number; startX: number; pulling: boolean } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { reduceRef.current = reduceMotion; }, [reduceMotion]);

  async function release(pulled: number) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (pulled >= PTR_TRIGGER) {
        setStatus('refreshing');
        if (reduceRef.current) pullY.set(PTR_HOLD);
        else await animate(pullY, PTR_HOLD, { type: 'spring', stiffness: 320, damping: 30 });
        try { await onRefreshRef.current(); } catch { /* 刷新失败也不卡住指示条 */ }
      }
      setStatus('idle');
      if (reduceRef.current) pullY.set(0);
      else await animate(pullY, 0, { type: 'spring', stiffness: 260, damping: 24 });
    } finally {
      busyRef.current = false;
    }
  }

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onTouchStart = (event: TouchEvent) => {
      if (disabledRef.current || statusRef.current === 'refreshing' || busyRef.current) return;
      if (window.scrollY > 0) return;
      const touch = event.touches[0];
      gestureRef.current = { startY: touch.clientY, startX: touch.clientX, pulling: false };
    };
    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const touch = event.touches[0];
      const dy = touch.clientY - gesture.startY;
      const dx = touch.clientX - gesture.startX;
      if (!gesture.pulling) {
        if (dy <= 8 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          if (dy < 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) gestureRef.current = null;
          return;
        }
        gesture.pulling = true;
        setStatus('pulling');
      }
      event.preventDefault();
      pullY.set(dampPullDistance(dy));
    };
    const onTouchEnd = () => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture || !gesture.pulling) return;
      void release(pullY.get());
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
    // 监听只挂一次，回调与状态一律走 ref，避免 onRefresh 换 identity 就重挂。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    if (disabledRef.current || statusRef.current === 'refreshing' || busyRef.current) return;
    if (window.scrollY > 0) return;
    if ((event.target as Element).closest('a, button, input, textarea, select, [role="button"]')) return;
    gestureRef.current = { startY: event.clientY, startX: event.clientX, pulling: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const gesture = gestureRef.current;
    if (!gesture || event.buttons !== 1) return;
    const dy = event.clientY - gesture.startY;
    const dx = event.clientX - gesture.startX;
    if (!gesture.pulling) {
      if (dy <= 8 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) gestureRef.current = null;
        return;
      }
      gesture.pulling = true;
      setStatus('pulling');
    }
    pullY.set(dampPullDistance(dy));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || !gesture.pulling) return;
    void release(pullY.get());
  };

  return (
    <div
      ref={rootRef}
      className={className ? `ptr ${className}` : 'ptr'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <motion.div className="ptr-indicator" style={{ height: pullY }} aria-hidden="true">
        <motion.span
          className={status === 'refreshing' ? 'ptr-icon is-spinning' : 'ptr-icon'}
          style={{ rotate: iconRotate, opacity: iconOpacity }}
        >
          ↻
        </motion.span>
      </motion.div>
      <motion.div className="ptr-content" style={{ y: pullY }}>
        {children}
      </motion.div>
      <div className="ptr-live" role="status" aria-live="polite">{STATUS_TEXT[status]}</div>
    </div>
  );
}
