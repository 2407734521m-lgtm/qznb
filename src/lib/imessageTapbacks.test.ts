import { describe, expect, it } from 'vitest';
import { IMESSAGE_TAPBACKS } from './imessageTapbacks';

describe('iMessage Tapback set', () => {
  it('uses the six native-style reactions in their familiar order', () => {
    expect(IMESSAGE_TAPBACKS.map(item => item.reaction)).toEqual([
      '❤️', '👍', '👎', '😂', '‼️', '❓',
    ]);
  });

  it('has unique reaction values and accessible Chinese labels', () => {
    const values = IMESSAGE_TAPBACKS.map(item => item.reaction);
    expect(new Set(values).size).toBe(values.length);
    expect(IMESSAGE_TAPBACKS.every(item => item.label.trim().length > 0)).toBe(true);
  });
});
