import { describe, expect, it } from 'vitest';
import { resolveSwipeIntent, shouldTriggerSwipeDelete, UNDO_WINDOW_MS } from './SwipeToDelete';

describe('resolveSwipeIntent', () => {
  it('needs a clear move before deciding, so taps do not become swipes', () => {
    expect(resolveSwipeIntent(4, 2)).toBe('undecided');
    expect(resolveSwipeIntent(-9, 3)).toBe('undecided');
  });

  it('takes over only when the move is clearly horizontal', () => {
    expect(resolveSwipeIntent(30, 5)).toBe('horizontal');
    expect(resolveSwipeIntent(-25, 3)).toBe('horizontal');
  });

  it('lets vertical and diagonal moves fall through to page scroll', () => {
    expect(resolveSwipeIntent(5, 40)).toBe('vertical');
    expect(resolveSwipeIntent(-20, 30)).toBe('vertical');
  });
});

describe('shouldTriggerSwipeDelete', () => {
  it('fires only past half the item width, leftwards only', () => {
    expect(shouldTriggerSwipeDelete(-201, 400)).toBe(true);
    expect(shouldTriggerSwipeDelete(-200, 400)).toBe(false);
    expect(shouldTriggerSwipeDelete(-50, 400)).toBe(false);
    expect(shouldTriggerSwipeDelete(300, 400)).toBe(false);
  });

  it('never fires without a measurable width', () => {
    expect(shouldTriggerSwipeDelete(-300, 0)).toBe(false);
  });
});

describe('undo window', () => {
  it('matches the five-second acceptance wording', () => {
    expect(UNDO_WINDOW_MS).toBe(5000);
  });
});
