export type GesturePoint = { x: number; y: number };
export type SwipeReplySide = 'mine' | 'theirs';

export const SWIPE_REPLY_DISTANCE = 64;
export const SWIPE_REPLY_MAX_VERTICAL_DRIFT = 36;
export const SWIPE_REPLY_MAX_OFFSET = 88;

export type SwipeReplyVisual = { offset: number; progress: number };

/** Reply swipes travel toward the center: left for sent messages, right for received ones. */
export function isSwipeToReply(
  start: GesturePoint,
  end: GesturePoint,
  side: SwipeReplySide = 'mine',
): boolean {
  const deltaX = end.x - start.x;
  const directedDistance = side === 'mine' ? -deltaX : deltaX;
  const deltaY = Math.abs(end.y - start.y);
  return directedDistance >= SWIPE_REPLY_DISTANCE
    && deltaY <= SWIPE_REPLY_MAX_VERTICAL_DRIFT;
}

/** Smooth, bounded follow distance and reveal progress for the reply affordance. */
export function getSwipeReplyVisual(deltaX: number, side: SwipeReplySide): SwipeReplyVisual {
  const directedDistance = Math.max(0, side === 'mine' ? -deltaX : deltaX);
  const distance = Math.min(SWIPE_REPLY_MAX_OFFSET, directedDistance * 0.72);
  return {
    offset: side === 'mine' ? -distance : distance,
    progress: Math.min(1, directedDistance / SWIPE_REPLY_DISTANCE),
  };
}
