import { describe, expect, it } from 'vitest';
import {
  CARD_SWIPE_MIN_PX,
  isCardTap,
  nextCardIndex,
  prevCardIndex,
  resolveCardSwipe,
  shouldSuppressClickAfterSwipe,
} from './CardSwitcher';

describe('resolveCardSwipe', () => {
  it('左滑 40px 以上换下一张，右滑换上一张', () => {
    expect(resolveCardSwipe(-80, -5)).toBe('next');
    expect(resolveCardSwipe(-CARD_SWIPE_MIN_PX, 0)).toBe('next');
    expect(resolveCardSwipe(80, 5)).toBe('previous');
    expect(resolveCardSwipe(CARD_SWIPE_MIN_PX, 0)).toBe('previous');
  });

  it('短拖、纵向滑、对角拖都不换卡', () => {
    expect(resolveCardSwipe(-20, 0)).toBeNull();
    expect(resolveCardSwipe(39, 0)).toBeNull();
    expect(resolveCardSwipe(0, -60)).toBeNull();
    expect(resolveCardSwipe(80, -60)).toBeNull();
    expect(resolveCardSwipe(-80, 60)).toBeNull();
  });
});

describe('card index wraps around', () => {
  it('到头绕回来', () => {
    expect(nextCardIndex(2, 3)).toBe(0);
    expect(prevCardIndex(0, 3)).toBe(2);
    expect(nextCardIndex(0, 1)).toBe(0);
  });

  it('空组不越界', () => {
    expect(nextCardIndex(0, 0)).toBe(0);
    expect(prevCardIndex(0, 0)).toBe(0);
  });
});

describe('tap vs swipe', () => {
  it('手指几乎没动算点按，点按不换卡、照常进原页', () => {
    expect(isCardTap(0, 0)).toBe(true);
    expect(isCardTap(5, 5)).toBe(true);
    expect(isCardTap(30, 0)).toBe(false);
    expect(resolveCardSwipe(5, 5)).toBeNull();
  });

  it('滑完那一下的 click 要吞掉，点按的 click 不吞', () => {
    expect(shouldSuppressClickAfterSwipe(-60, 0)).toBe(true);
    expect(shouldSuppressClickAfterSwipe(60, 0)).toBe(true);
    expect(shouldSuppressClickAfterSwipe(5, 5)).toBe(false);
    expect(shouldSuppressClickAfterSwipe(0, -60)).toBe(false);
  });
});
