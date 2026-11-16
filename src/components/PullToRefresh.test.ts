import { describe, expect, it } from 'vitest';
import { dampPullDistance, PTR_TRIGGER, pullProgress } from './PullToRefresh';

describe('dampPullDistance', () => {
  it('returns 0 for no pull or upward pull', () => {
    expect(dampPullDistance(0)).toBe(0);
    expect(dampPullDistance(-40)).toBe(0);
  });

  it('damps: output stays below the raw distance and below the ceiling', () => {
    expect(dampPullDistance(64)).toBeLessThan(64);
    expect(dampPullDistance(1000)).toBeLessThan(96);
    expect(dampPullDistance(1000)).toBeGreaterThan(90);
  });

  it('is concave: early pixels move further than later pixels', () => {
    const first = dampPullDistance(50) - dampPullDistance(0);
    const later = dampPullDistance(150) - dampPullDistance(100);
    expect(first).toBeGreaterThan(later);
  });
});

describe('pullProgress', () => {
  it('maps the trigger distance to 1 and clamps beyond it', () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PTR_TRIGGER / 2)).toBe(0.5);
    expect(pullProgress(PTR_TRIGGER)).toBe(1);
    expect(pullProgress(PTR_TRIGGER * 3)).toBe(1);
  });
});
