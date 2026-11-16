import { describe, expect, it, vi } from 'vitest';
import {
  SLIDE_CONFIRM_KEY_STEP,
  SLIDE_CONFIRM_THRESHOLD,
  createSlideConfirmOnce,
  slideProgress,
  slideReachedEnd,
} from './SlideToConfirm';

describe('slideProgress', () => {
  it('偏移换算成 0~1 的进度，越界夹住', () => {
    expect(slideProgress(0, 200)).toBe(0);
    expect(slideProgress(100, 200)).toBe(0.5);
    expect(slideProgress(200, 200)).toBe(1);
    expect(slideProgress(300, 200)).toBe(1);
    expect(slideProgress(-10, 200)).toBe(0);
    expect(slideProgress(100, 0)).toBe(0);
  });
});

describe('slideReachedEnd', () => {
  it('滑到 92% 才算到底，滑一半不算', () => {
    expect(slideReachedEnd(0.5)).toBe(false);
    expect(slideReachedEnd(0.91)).toBe(false);
    expect(slideReachedEnd(SLIDE_CONFIRM_THRESHOLD)).toBe(true);
    expect(slideReachedEnd(1)).toBe(true);
  });
});

describe('createSlideConfirmOnce', () => {
  it('未到底不执行，到底只执行一次', () => {
    const onConfirm = vi.fn();
    const fire = createSlideConfirmOnce(onConfirm);
    // 没到底：不调 fire，onConfirm 不跑；这里直接验守卫本身不重复放行。
    expect(fire()).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(fire()).toBe(false);
    expect(fire()).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('键盘 4 次方向键刚好到底：0.25 一步，4 步到 1', () => {
    let progress = 0;
    for (let i = 0; i < 4; i++) progress = Math.min(1, progress + SLIDE_CONFIRM_KEY_STEP);
    expect(progress).toBe(1);
    expect(slideReachedEnd(progress)).toBe(true);
    expect(slideReachedEnd(3 * SLIDE_CONFIRM_KEY_STEP)).toBe(false);
  });
});
