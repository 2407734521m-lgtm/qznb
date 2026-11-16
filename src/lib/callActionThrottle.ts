/**
 * Blocks rapid repeats of phase-changing call actions (accept / reject /
 * cancel / hang up). After a phase change React may mount a different button
 * under the same finger, so the second tap of a fast double-tap must not fire
 * the new button's action — e.g. a second tap on "接听" landing on "取消连接".
 * One shared instance guards all four actions; mute / speaker toggles are not
 * phase-changing and stay unthrottled.
 */
export function createCallActionThrottle(windowMs = 300) {
  let lastAcceptedAt: number | null = null;
  return {
    /** Returns true for the first action, false while inside the window. */
    tryRun(now: number = Date.now()): boolean {
      if (lastAcceptedAt !== null && now - lastAcceptedAt < windowMs) return false;
      lastAcceptedAt = now;
      return true;
    },
  };
}
