import { describe, expect, it } from 'vitest';
import { normalizeStandaloneNumericUnderline } from './chatMessagePresentation';

describe('normalizeStandaloneNumericUnderline', () => {
  it('removes accidental underline from a standalone one-digit message', () => {
    expect(normalizeStandaloneNumericUnderline('++1++')).toBe('1');
    expect(normalizeStandaloneNumericUnderline('  ++7++  ')).toBe('  7  ');
  });

  it('preserves intentional underline for words and multi-digit values', () => {
    expect(normalizeStandaloneNumericUnderline('++q1++')).toBe('++q1++');
    expect(normalizeStandaloneNumericUnderline('++12++')).toBe('++12++');
    expect(normalizeStandaloneNumericUnderline('这里是 ++重点++')).toBe('这里是 ++重点++');
  });

  it('leaves ordinary numeric messages untouched', () => {
    expect(normalizeStandaloneNumericUnderline('1')).toBe('1');
    expect(normalizeStandaloneNumericUnderline('q1')).toBe('q1');
  });
});
