/** Short vibration cues for the island. Works in Android Chrome and WebViews; silently skipped elsewhere. */
export type HapticKind = 'tick' | 'alert';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 8,
  alert: [14, 70, 14],
};

let enabled = true;

/** Mirrors the account's 触感反馈 switch; the island provider keeps it in sync. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function haptic(kind: HapticKind = 'tick'): boolean {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  // Chrome ignores (and warns about) vibration before the first tap on the page.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
  try {
    return navigator.vibrate(PATTERNS[kind]);
  } catch {
    return false;
  }
}
