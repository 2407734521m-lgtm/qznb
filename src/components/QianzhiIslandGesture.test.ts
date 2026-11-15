import { describe, expect, it } from 'vitest';
import { resolveIslandDockGesture } from './QianzhiMusicIslandActivity';

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
