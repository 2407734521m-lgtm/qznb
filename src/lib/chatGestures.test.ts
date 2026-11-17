import { describe, expect, it } from 'vitest';
import { isSwipeToReply } from './chatGestures';

describe('iMessage swipe-to-reply gesture', () => {
  it('accepts a deliberate left swipe', () => {
    expect(isSwipeToReply({ x: 220, y: 100 }, { x: 150, y: 114 })).toBe(true);
  });

  it('does not treat a right swipe as a reply', () => {
    expect(isSwipeToReply({ x: 150, y: 100 }, { x: 220, y: 110 })).toBe(false);
  });

  it('does not take over vertical scrolling', () => {
    expect(isSwipeToReply({ x: 220, y: 100 }, { x: 150, y: 145 })).toBe(false);
  });

  it('ignores short horizontal movements', () => {
    expect(isSwipeToReply({ x: 220, y: 100 }, { x: 180, y: 110 })).toBe(false);
  });
});
