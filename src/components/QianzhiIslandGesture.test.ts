import { describe, expect, it } from 'vitest';
import { resolveIslandDockGesture, resolveIslandSwipeGesture } from './QianzhiMusicIslandActivity';

describe('swipe up on the island', () => {
  it('hides the island when no heads-up is showing', () => {
    expect(resolveIslandDockGesture('island', 2, -60)).toBe('dock');
    expect(resolveIslandDockGesture('island', 2, -60, false)).toBe('dock');
  });

  it('closes only the alert while one is showing', () => {
    expect(resolveIslandDockGesture('island', 2, -60, true)).toBe('dismiss');
  });

  it('leaves short, sideways and restore gestures alone', () => {
    expect(resolveIslandDockGesture('island', 0, -20, true)).toBeNull();
    expect(resolveIslandDockGesture('island', 80, -60, true)).toBeNull();
    expect(resolveIslandDockGesture('peek', 0, 40, true)).toBe('restore');
    expect(resolveIslandDockGesture('peek', 1, 2, true)).toBe('restore');
  });
});

describe('swipe left or right on the island', () => {
  it('goes to the next activity on a left swipe and back on a right swipe', () => {
    expect(resolveIslandSwipeGesture(-80, -5)).toBe('next');
    expect(resolveIslandSwipeGesture(-40, 0)).toBe('next');
    expect(resolveIslandSwipeGesture(80, 5)).toBe('previous');
    expect(resolveIslandSwipeGesture(40, 0)).toBe('previous');
  });

  it('ignores short, vertical and diagonal drags', () => {
    expect(resolveIslandSwipeGesture(-20, 0)).toBeNull();
    expect(resolveIslandSwipeGesture(39, 0)).toBeNull();
    expect(resolveIslandSwipeGesture(0, -60)).toBeNull();
    expect(resolveIslandSwipeGesture(80, -60)).toBeNull();
    expect(resolveIslandSwipeGesture(-80, 60)).toBeNull();
  });
});
