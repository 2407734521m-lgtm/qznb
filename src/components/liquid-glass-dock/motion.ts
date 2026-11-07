// Adapted from https://github.com/clayharmon/webgl-liquid-glass (MIT).
// See THIRD_PARTY_NOTICES.md for the upstream license.
const LERP = 0.08;
// lightPos drives lightBias and the two specular lobes in the fragment shader.
// Those sum to at most ~0.6 units of output colour per unit of lightPos, so a
// 4e-3 residual is under one 8-bit shading step (1/255) and the snap to target
// on settle is invisible.
const EPSILON = 4e-3;

/**
 * Tracks pointer position (desktop) and device orientation (mobile)
 * to produce a normalized light direction for the shimmer effect.
 *
 * Returns a mutable [x, y] tuple in the range [-1, 1]. The smoothing loop
 * parks itself once it reaches the target and restarts on the next input;
 * `isSettled()` reports whether anything is still moving. `onWake` fires on
 * the settled -> moving edge so a caller that idles its own render loop can
 * restart it; polling alone cannot recover from a fully idle state.
 */
export function createMotionTracker(
  container: HTMLElement,
  onWake?: () => void,
): {
  lightPos: [number, number];
  isSettled(): boolean;
  destroy(): void;
} {
  const lightPos: [number, number] = [0, 0];

  // Smooth towards target to avoid jitter
  const target: [number, number] = [0, 0];
  let frame = 0;
  let settled = true;
  let destroyed = false;

  function tick() {
    frame = 0;
    const dx = target[0] - lightPos[0];
    const dy = target[1] - lightPos[1];
    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
      lightPos[0] = target[0];
      lightPos[1] = target[1];
      settled = true;
      return;
    }
    lightPos[0] += dx * LERP;
    lightPos[1] += dy * LERP;
    frame = requestAnimationFrame(tick);
  }

  // Restart the loop after new input; no-op while it is already running
  function wake() {
    if (destroyed) return;
    const wasSettled = settled;
    settled = false;
    if (!frame) frame = requestAnimationFrame(tick);
    // Edge only: a mouse drag is hundreds of pointermoves but one wake. State
    // above is already consistent, because onWake may synchronously restart the
    // caller's loop, which reads lightPos and calls isSettled(). A wake() from
    // inside that callback sees wasSettled === false and stops the recursion.
    if (wasSettled) onWake?.();
  }

  // --- Container centre cache ---
  // getBoundingClientRect() inside pointermove forces a layout on every mouse
  // move anywhere on the page. Read it lazily, and only after something could
  // have moved the nav.
  let centerX = 0;
  let centerY = 0;
  let rectDirty = true;

  function invalidateRect() {
    rectDirty = true;
  }

  function readRect() {
    const rect = container.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    rectDirty = false;
  }

  const ro = new ResizeObserver(invalidateRect);
  ro.observe(container);
  window.addEventListener('resize', invalidateRect, { passive: true });
  // The nav is position: fixed by default, but consumers can make it relative,
  // so scrolling really can move it. Capture catches nested scrollers too.
  window.addEventListener('scroll', invalidateRect, {
    passive: true,
    capture: true,
  });

  let pointerAttached = false;
  let orientationAttached = false;
  let orientationLive = false;

  // --- Pointer tracking (desktop) ---
  function onPointerMove(e: PointerEvent) {
    if (rectDirty) readRect();
    // Map to [-1, 1] relative to container center, clamped to reasonable range
    target[0] = Math.max(
      -1,
      Math.min(1, (e.clientX - centerX) / (window.innerWidth * 0.5)),
    );
    target[1] = Math.max(
      -1,
      Math.min(1, -(e.clientY - centerY) / (window.innerHeight * 0.5)),
    );
    wake();
  }

  function attachPointer() {
    if (pointerAttached || orientationLive) return;
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    pointerAttached = true;
  }

  function detachPointer() {
    if (!pointerAttached) return;
    window.removeEventListener('pointermove', onPointerMove);
    pointerAttached = false;
  }

  // --- Device orientation (mobile) ---
  function onOrientation(e: DeviceOrientationEvent) {
    if (e.gamma == null || e.beta == null) return;
    // Both inputs fire on a touch device and fight over `target`. Tilt is the
    // continuous signal there, so it takes over for good on its first reading.
    orientationLive = true;
    detachPointer();
    // gamma: left/right tilt (-90..90), beta: front/back tilt (-180..180)
    target[0] = Math.max(-1, Math.min(1, e.gamma / 45));
    target[1] = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
    wake();
  }

  function attachOrientation() {
    if (orientationAttached) return;
    orientationAttached = true;

    // Request permission on iOS 13+
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof doe.requestPermission === 'function') {
      doe
        .requestPermission()
        .then((state) => {
          // May resolve after destroy(), or after reduced motion turned on
          if (destroyed || !orientationAttached) return;
          if (state === 'granted') {
            window.addEventListener('deviceorientation', onOrientation, {
              passive: true,
            });
          }
        })
        .catch(() => {});
    } else {
      window.addEventListener('deviceorientation', onOrientation, {
        passive: true,
      });
    }
  }

  function detachOrientation() {
    if (!orientationAttached) return;
    window.removeEventListener('deviceorientation', onOrientation);
    orientationAttached = false;
  }

  // --- Reduced motion ---
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function applyReducedMotion() {
    if (reduceQuery.matches) {
      detachPointer();
      detachOrientation();
      const offNeutral = lightPos[0] !== 0 || lightPos[1] !== 0;
      target[0] = 0;
      target[1] = 0;
      lightPos[0] = 0;
      lightPos[1] = 0;
      // Snap to neutral, then ask for one frame so a live render loop sees it
      if (offNeutral) wake();
    } else {
      attachPointer();
      attachOrientation();
    }
  }

  applyReducedMotion();
  reduceQuery.addEventListener('change', applyReducedMotion);

  function destroy() {
    destroyed = true;
    settled = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    detachPointer();
    detachOrientation();
    ro.disconnect();
    window.removeEventListener('resize', invalidateRect);
    window.removeEventListener('scroll', invalidateRect, { capture: true });
    reduceQuery.removeEventListener('change', applyReducedMotion);
  }

  return {
    lightPos,
    isSettled: () => settled,
    destroy,
  };
}
