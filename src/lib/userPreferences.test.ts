import { describe, expect, it, vi } from 'vitest';

// The preferences module imports the Supabase client, which needs a browser; the test only needs the pure normalizer.
vi.mock('./supabase', () => ({ supabase: {} }));
import { normalizeUserPreferences, resolveMotionReduced } from './userPreferences';

describe('island haptics preference', () => {
  it('is on by default and stays off once switched off', () => {
    expect(normalizeUserPreferences(null).island.haptics).toBe(true);
    expect(normalizeUserPreferences({ island: { offsetX: 4 } }).island.haptics).toBe(true);
    expect(normalizeUserPreferences({ island: { haptics: false } }).island.haptics).toBe(false);
  });
});

describe('resolveMotionReduced', () => {
  it('forces reduced motion when the account preference is reduce', () => {
    expect(resolveMotionReduced('reduce', false)).toBe(true);
  });

  it('follows the system for system and full, which never override it', () => {
    expect(resolveMotionReduced('system', false)).toBe(false);
    expect(resolveMotionReduced('system', true)).toBe(true);
    expect(resolveMotionReduced('full', false)).toBe(false);
    expect(resolveMotionReduced('full', true)).toBe(true);
  });
});
