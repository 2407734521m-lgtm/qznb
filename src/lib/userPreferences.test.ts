import { describe, expect, it, vi } from 'vitest';

// The preferences module imports the Supabase client, which needs a browser; the test only needs the pure normalizer.
vi.mock('./supabase', () => ({ supabase: {} }));
import { normalizeUserPreferences } from './userPreferences';

describe('island haptics preference', () => {
  it('is on by default and stays off once switched off', () => {
    expect(normalizeUserPreferences(null).island.haptics).toBe(true);
    expect(normalizeUserPreferences({ island: { offsetX: 4 } }).island.haptics).toBe(true);
    expect(normalizeUserPreferences({ island: { haptics: false } }).island.haptics).toBe(false);
  });
});
