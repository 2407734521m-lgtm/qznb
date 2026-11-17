export type GesturePoint = { x: number; y: number };

export const SWIPE_REPLY_DISTANCE = 56;
export const SWIPE_REPLY_MAX_VERTICAL_DRIFT = 36;

/** A leftward swipe with limited vertical drift, so normal scrolling remains native. */
export function isSwipeToReply(start: GesturePoint, end: GesturePoint): boolean {
  const deltaX = end.x - start.x;
  const deltaY = Math.abs(end.y - start.y);
  return deltaX <= -SWIPE_REPLY_DISTANCE && deltaY <= SWIPE_REPLY_MAX_VERTICAL_DRIFT;
}
