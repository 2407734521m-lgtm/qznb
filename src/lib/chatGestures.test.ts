import { describe, expect, it } from 'vitest';
import { getSwipeReplyVisual, isSwipeToReply } from './chatGestures';

describe('iMessage swipe-to-reply gesture', () => {
  it('accepts a deliberate inward swipe on a sent message', () => {
    expect(isSwipeToReply({ x: 220, y: 100 }, { x: 150, y: 114 }, 'mine')).toBe(true);
  });

  it('accepts a deliberate inward swipe on a received message', () => {
    expect(isSwipeToReply({ x: 80, y: 100 }, { x: 150, y: 114 }, 'theirs')).toBe(true);
  });

  it('does not accept a swipe away from the conversation center', () => {
    expect(isSwipeToReply({ x: 150, y: 100 }, { x: 220, y: 110 }, 'mine')).toBe(false);
    expect(isSwipeToReply({ x: 220, y: 100 }, { x: 150, y: 110 }, 'theirs')).toBe(false);
  });

  it('does not take over vertical scrolling', () => {
    expect(isSwipeToReply({ x: 220, y: 100 }, { x: 150, y: 145 }, 'mine')).toBe(false);
  });

  it('ignores short horizontal movements', () => {
    expect(isSwipeToReply({ x: 220, y: 100 }, { x: 180, y: 110 }, 'mine')).toBe(false);
  });

  it('moves the sent bubble left and reveals progress smoothly', () => {
    expect(getSwipeReplyVisual(-32, 'mine')).toEqual({ offset: -23.04, progress: 0.5 });
  });

  it('moves the received bubble right and caps the travel distance', () => {
    expect(getSwipeReplyVisual(200, 'theirs')).toEqual({ offset: 88, progress: 1 });
  });

  it('does not move in the wrong direction', () => {
    expect(getSwipeReplyVisual(40, 'mine')).toEqual({ offset: 0, progress: 0 });
  });
});
