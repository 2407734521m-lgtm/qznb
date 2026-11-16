import type { IslandMotionOverrides } from './config';

/**
 * Qianzhi's island profile: slightly quicker, more tactile transitions than the
 * calibrated upstream defaults, while keeping the same continuous geometry.
 *
 * blendDuration carries a little of the in-flight motion into a retarget, so a
 * quick tap/expand/collapse does not feel like the pill changed its mind abruptly.
 * The split/neck choreography is intentionally left at its calibrated defaults.
 */
const spring = (response: number, dampingFraction: number) => ({
  response,
  dampingFraction,
  blendDuration: 0.08,
});

export const qianzhiIslandMotion = {
  shape: {
    appear: spring(0.44, 0.73),
    expand: spring(0.45, 0.77),
    pressExpand: spring(0.36, 0.76),
    appearExpand: spring(0.46, 0.78),
    swap: spring(0.45, 0.78),
    collapse: spring(0.42, 0.88),
    alertCollapse: spring(0.44, 0.86),
    split: spring(0.44, 0.78),
    unsplit: spring(0.44, 0.78),
    dismiss: spring(0.4, 0.92),
    resize: spring(0.4, 0.82),
  },
  body: {
    appear: spring(0.44, 0.73),
    expand: spring(0.45, 0.77),
    pressExpand: spring(0.36, 0.76),
    appearExpand: spring(0.46, 0.78),
    swap: spring(0.45, 0.78),
    collapse: spring(0.42, 0.9),
    alertCollapse: spring(0.44, 0.88),
    split: spring(0.44, 0.78),
    unsplit: spring(0.44, 0.78),
    dismiss: spring(0.4, 0.92),
    resize: spring(0.4, 0.82),
  },
  corner: {
    appear: spring(0.44, 0.73),
    expand: { ...spring(0.42, 0.82), delay: 0.018 },
    pressExpand: { ...spring(0.31, 0.8), delay: 0.019 },
    appearExpand: { ...spring(0.43, 0.82), delay: 0.02 },
    swap: { ...spring(0.4, 0.86), delay: 0.244 },
    collapse: { ...spring(0.41, 0.92), delay: 0.01 },
    alertCollapse: { ...spring(0.43, 0.88), delay: 0.009 },
    split: spring(0.44, 0.78),
    unsplit: spring(0.44, 0.78),
    dismiss: spring(0.4, 0.92),
    resize: spring(0.4, 0.82),
  },
} satisfies IslandMotionOverrides;
