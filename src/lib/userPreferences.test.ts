import { describe, expect, it, vi } from 'vitest';

// The preferences module imports the Supabase client, which needs a browser; the test only needs the pure normalizer.
vi.mock('./supabase', () => ({ supabase: {} }));
import { DEFAULT_USER_PREFERENCES, mergeUserPreferences, normalizeUserPreferences, resolveAccountUserPreferences, resolveMotionReduced } from './userPreferences';

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

describe('account-scoped preference resolution', () => {
  it('uses the requested account cache before the account state effect runs', () => {
    const previousAccount = { ...DEFAULT_USER_PREFERENCES, motion: 'reduce' as const };
    const nextAccountCache = { ...DEFAULT_USER_PREFERENCES, motion: 'full' as const };
    expect(resolveAccountUserPreferences('previous', 'next', previousAccount, nextAccountCache)).toBe(nextAccountCache);
    expect(resolveAccountUserPreferences('next', 'next', nextAccountCache, previousAccount)).toBe(nextAccountCache);
  });

  it('keeps an unsynced local edit when an older cloud read completes', () => {
    const local = normalizeUserPreferences({ motion: 'reduce', island: { width: 128 } });
    const remote = normalizeUserPreferences({ motion: 'full', island: { width: 104 } });
    expect(mergeUserPreferences(local, remote, true).motion).toBe('reduce');
    expect(mergeUserPreferences(local, remote, true).island.width).toBe(128);
    expect(mergeUserPreferences(local, remote).motion).toBe('full');
    expect(mergeUserPreferences(local, remote).island.width).toBe(104);
  });
});
