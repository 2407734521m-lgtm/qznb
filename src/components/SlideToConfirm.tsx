import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import './SlideToConfirm.css';

/**
 * 滑动确认（借 Bencho 微交互的形态重写，未抄源码）：
 * 滑块拖到底才执行，滑一半松手回弹，未到底不执行，只执行一次。
 * 只用在 Dock 快捷面板的“退出登录”确认上，文案沿用站内确认框。
 *
 * 形态来源：Bencho（bencho.dev，framer-motion 微交互库，免费块 MIT）。
 */

/** 滑到轨道 92% 即算到底。 */
export const SLIDE_CONFIRM_THRESHOLD = 0.92;
/** 键盘每按一次方向键前进的进度。 */
export const SLIDE_CONFIRM_KEY_STEP = 0.25;

/** 滑块偏移换算成 0~1 的进度，越界夹住。 */
export function slideProgress(offsetPx: number, trackWidthPx: number): number {
  if (!(trackWidthPx > 0)) return 0;
  return Math.max(0, Math.min(1, offsetPx / trackWidthPx));
}

/** 进度够了才算到底。 */
export function slideReachedEnd(progress: number): boolean {
  return progress >= SLIDE_CONFIRM_THRESHOLD;
}

/**
 * 只执行一次的守卫：第一次调用放行并返回 true，之后再调都返回 false。
 * 防止 pointerup 和键盘同时触发、或抬手抖动导致重复执行。
 */
export function createSlideConfirmOnce(onConfirm: () => void): () => boolean {
  let fired = false;
  return () => {
    if (fired) return false;
    fired = true;
    onConfirm();
    return true;
  };
}

export interface SlideToConfirmProps {
  /** 滑块上的文案，如“退出登录”。 */
  label: string;
  /** 轨道里的提示文案。 */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}

export default function SlideToConfirm({ label, hint = '向右滑动确认', danger = false, disabled = false, onConfirm }: SlideToConfirmProps) {
  const reduceMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLButtonElement | null>(null);
  const startXRef = useRef(0);
  const startProgressRef = useRef(0);
  const maxOffsetRef = useRef(0);
  const confirmOnceRef = useRef<() => boolean>(() => false);
  // onConfirm 只取第一版，避免拖动中父组件重渲染换掉回调导致重复触发。
  useEffect(() => {
    confirmOnceRef.current = createSlideConfirmOnce(onConfirm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 挂载时量一次轨道宽度，键盘用户没按过滑块也能看到滑块走到头。
  useEffect(() => {
    measureMaxOffset();
    window.addEventListener('resize', measureMaxOffset);
    return () => window.removeEventListener('resize', measureMaxOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function measureMaxOffset(): number {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return 0;
    const max = track.clientWidth - thumb.clientWidth - 4;
    maxOffsetRef.current = Math.max(0, max);
    return maxOffsetRef.current;
  }

  function finishDrag(nextProgress: number) {
    setDragging(false);
    if (slideReachedEnd(nextProgress)) {
      setProgress(1);
      confirmOnceRef.current();
    } else {
      setProgress(0);
    }
  }

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const max = maxOffsetRef.current;
      if (max <= 0) return;
      const offset = startProgressRef.current * max + (e.clientX - startXRef.current);
      setProgress(slideProgress(offset, max));
    }
    function onUp() {
      // 用函数式读最新进度：拖动结束那一刻的 progress 在闭包里可能还是旧值，
      // 所以直接从 DOM 量 thumb 位置再算一次。
      const track = trackRef.current;
      const thumb = thumbRef.current;
      let p = 0;
      if (track && thumb) {
        const trackRect = track.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();
        const max = Math.max(1, trackRect.width - thumbRect.width - 4);
        p = slideProgress(thumbRect.left - trackRect.left - 2, max);
      }
      finishDrag(p);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function onThumbPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const max = measureMaxOffset();
    if (max <= 0) return;
    startXRef.current = e.clientX;
    startProgressRef.current = progress;
    setDragging(true);
  }

  function onThumbKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(1, progress + SLIDE_CONFIRM_KEY_STEP);
    else if (e.key === 'ArrowLeft') next = Math.max(0, progress - SLIDE_CONFIRM_KEY_STEP);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    if (next === null) return;
    e.preventDefault();
    setProgress(next);
    if (slideReachedEnd(next)) confirmOnceRef.current();
  }

  const maxOffset = maxOffsetRef.current;
  const thumbX = progress * maxOffset;

  return (
    <div className={`qz-slide-confirm${danger ? ' is-danger' : ''}`}>
      <div className="qz-slide-confirm-track" ref={trackRef}>
        <div
          className="qz-slide-confirm-fill"
          style={{ width: `${Math.round(progress * 100)}%`, transitionDuration: reduceMotion || dragging ? '0ms' : '180ms' }}
          aria-hidden="true"
        />
        <span className="qz-slide-confirm-hint" aria-hidden="true">{hint}</span>
        <button
          ref={thumbRef}
          type="button"
          className="qz-slide-confirm-thumb"
          role="slider"
          aria-label={`${label}：向右滑动确认`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuetext={slideReachedEnd(progress) ? '已确认' : `已滑 ${Math.round(progress * 100)}%`}
          disabled={disabled}
          style={{
            transform: `translateX(${thumbX}px)`,
            transitionDuration: reduceMotion || dragging ? '0ms' : '180ms',
          }}
          onPointerDown={onThumbPointerDown}
          onKeyDown={onThumbKeyDown}
        >
          →
        </button>
      </div>
      <span className="qz-slide-confirm-label">{label}</span>
    </div>
  );
}
