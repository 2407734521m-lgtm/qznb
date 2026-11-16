import type { IslandMotionOverrides } from './config';

/**
 * Keep the island's geometry springs on the motion table's iOS-calibrated values.
 * The previous local profile shortened nearly every response and lowered damping,
 * which made expansion/collapse feel tight and slightly mechanical on touch devices.
 *
 * Only retarget blending is tuned locally: a longer blend preserves more of the
 * current velocity when a user interrupts a transition with another gesture.
 */
const spring = () => ({ blendDuration: 0.12 });

export const qianzhiIslandMotion = {
  shape: {
    appear: spring(),
    expand: spring(),
    pressExpand: spring(),
    appearExpand: spring(),
    swap: spring(),
    collapse: spring(),
    alertCollapse: spring(),
    split: spring(),
    unsplit: spring(),
    dismiss: spring(),
    resize: spring(),
  },
  body: {
    appear: spring(),
    expand: spring(),
    pressExpand: spring(),
    appearExpand: spring(),
    swap: spring(),
    collapse: spring(),
    alertCollapse: spring(),
    split: spring(),
    unsplit: spring(),
    dismiss: spring(),
    resize: spring(),
  },
  corner: {
    appear: spring(),
    expand: spring(),
    pressExpand: spring(),
    appearExpand: spring(),
    swap: spring(),
    collapse: spring(),
    alertCollapse: spring(),
    split: spring(),
    unsplit: spring(),
    dismiss: spring(),
    resize: spring(),
  },
} satisfies IslandMotionOverrides;
