import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './CardSwitcher.css';

/**
 * 卡片切换（借 Bencho 微交互的形态重写，未抄源码）：
 * 一组卡片一次只看一张，左右滑 40px 以上换一张，点按照常进原页，
 * 不动时每 6 秒自动换一张。只用在首页顶部公告那组卡片上。
 *
 * 形态来源：Bencho（bencho.dev，framer-motion 微交互库，免费块 MIT）。
 */

export const CARD_SWIPE_MIN_PX = 40;
export const CARD_TAP_MAX_PX = 10;
export const CARD_AUTO_ADVANCE_MS = 6000;

export type CardSwipeDirection = 'next' | 'previous';

/**
 * 一次拖动的落点：横向够 40px、且横向至少是纵向的 1.5 倍才算换卡；
 * 短拖、纵向滑、对角拖都返回 null，原地不动。
 * 阈值与岛上的横滑手势（resolveIslandSwipeGesture）保持同一套语言。
 */
export function resolveCardSwipe(dx: number, dy: number): CardSwipeDirection | null {
  if (Math.abs(dx) < CARD_SWIPE_MIN_PX) return null;
  if (Math.abs(dx) <= Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'next' : 'previous';
}

export function nextCardIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index + 1) % count;
}

export function prevCardIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index - 1 + count) % count;
}

/** 点按判定：手指几乎没动才算点按，滑过就算滑动。 */
export function isCardTap(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) <= CARD_TAP_MAX_PX;
}

/** 滑完那一下紧接着的 click 要吞掉，否则抬手会误触卡片进原页。 */
export function shouldSuppressClickAfterSwipe(dx: number, dy: number): boolean {
  return resolveCardSwipe(dx, dy) !== null;
}

export interface CardSwitcherProps {
  items: ReactNode[];
  /** 无障碍名，如“公告卡片”。 */
  label?: string;
  /** 自动轮播间隔毫秒；传 0 关闭。默认 6000。 */
  autoAdvanceMs?: number;
}

export default function CardSwitcher({ items, label = '卡片', autoAdvanceMs = CARD_AUTO_ADVANCE_MS }: CardSwitcherProps) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [paused, setPaused] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntilRef = useRef(0);
  const count = items.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);

  // 自动轮播：减动效、只有一张、手指正按着、悬停/聚焦时都停。
  useEffect(() => {
    if (count <= 1 || reduceMotion || paused || dragging || autoAdvanceMs <= 0) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setIndex(prev => nextCardIndex(prev, count));
    }, autoAdvanceMs);
    return () => window.clearInterval(timer);
  }, [count, reduceMotion, paused, dragging, autoAdvanceMs]);

  // 手指拖动时跟手走：拖动中才监听 window，免得手指滑出卡片就断线。
  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const start = startRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // 纵向滚动为主时不跟手，免得上下滑页面时卡片横着跑。
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < CARD_SWIPE_MIN_PX) return;
      setDragX(Math.max(-72, Math.min(72, dx)));
    }
    function onUp(e: PointerEvent) {
      const start = startRef.current;
      startRef.current = null;
      setDragging(false);
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dir = resolveCardSwipe(dx, dy);
      if (dir) {
        suppressClickUntilRef.current = Date.now() + 200;
        setIndex(prev => (dir === 'next' ? nextCardIndex(prev, count) : prevCardIndex(prev, count)));
      }
      setDragX(0);
      window.setTimeout(() => setPaused(false), 600);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, count]);

  if (count === 0) return null;

  function onPointerDown(e: React.PointerEvent) {
    if (count <= 1) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    setPaused(true);
  }

  function onClickCapture(e: React.MouseEvent) {
    if (Date.now() < suppressClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return (
    <div
      className="qz-card-switcher"
      role="region"
      aria-roledescription="轮播"
      aria-label={`${label}，共 ${count} 张`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="qz-card-switcher-viewport"
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
      >
        <motion.div
          key={safeIndex}
          className="qz-card-switcher-card"
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: dragX }}
          transition={reduceMotion
            ? { duration: 0.01 }
            : dragging
              ? { duration: 0.05 }
              : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {items[safeIndex]}
        </motion.div>
      </div>
      {count > 1 && (
        <div className="qz-card-switcher-dots" role="tablist" aria-label={`${label}切换`}>
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={`第 ${i + 1} 张，共 ${count} 张`}
              className={`qz-card-switcher-dot${i === safeIndex ? ' is-active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
