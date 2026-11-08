// Adapted from https://github.com/clayharmon/webgl-liquid-glass (MIT).
// See THIRD_PARTY_NOTICES.md for the upstream license.
import type { SpringState } from './types';

const STIFFNESS = 340;
const DAMPING = 26;
const SETTLE_THRESHOLD = 0.4;
const VELOCITY_THRESHOLD = 0.4;

// Semi-implicit Euler is only stable while dt stays small relative to the
// spring's period. At the default stiffness of 340 a single step of 0.064 --
// the clamp the render loop applies -- overshoots a 100px move by 39% and the
// amplitude grows every step after that, reaching NaN in about 90 frames. A
// phone sustaining 15fps would break the navbar permanently. Splitting long
// frames keeps it stable. 1/50 is above a 60fps frame, so the common path is
// still one step and the animation feel is unchanged.
const MAX_STEP = 1 / 50;

export function createSpring(initial: number): SpringState {
  return { current: initial, target: initial, velocity: 0 };
}

export function updateSpring(
  s: SpringState,
  dt: number,
  stiffness = STIFFNESS,
  damping = DAMPING,
): void {
  // Displacement is sampled before integrating, so a spring already inside the
  // settle window snaps on this call rather than the next one.
  const displacement = s.current - s.target;

  const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const springForce = -stiffness * (s.current - s.target);
    const dampingForce = -damping * s.velocity;
    s.velocity += (springForce + dampingForce) * h;
    s.current += s.velocity * h;
  }

  // Settle when close enough
  if (
    Math.abs(displacement) < SETTLE_THRESHOLD &&
    Math.abs(s.velocity) < VELOCITY_THRESHOLD
  ) {
    s.current = s.target;
    s.velocity = 0;
  }
}
