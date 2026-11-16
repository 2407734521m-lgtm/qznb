import type { IslandMetricsOverrides } from './config';

/**
 * Qianzhi's web island profile: a slightly longer, slimmer compact capsule.
 * The upstream engine remains unchanged; only the public-site presentation is tuned.
 */
export const qianzhiIslandMetrics = {
  top: 12.5,
  /**
   * Wider expanded card on desktop: the expanded player is a large floating
   * card (cover, progress, five controls), not a phone-width slab. Phones are
   * unaffected: the stage clamps to the container when it is narrower.
   */
  screen: { width: 640 },
  idle: {
    width: 104,
    height: 31.5,
  },
  compact: {
    height: 31.5,
    sensorWidth: 104,
    edgePadding: 8,
  },
  minimal: {
    height: 31.5,
  },
  /**
   * The compact player layout is sized around a 52px cover, progress, controls
   * and volume row. Keep enough headroom for the complete controls while
   * avoiding the oversized 300px expansion on mobile.
   */
  expanded: { maxHeight: 224 },
} satisfies IslandMetricsOverrides;


/** Build runtime geometry from the user's saved capsule dimensions. */
export function createQianzhiIslandMetrics(dimensions: { width: number; height: number }) {
  const { width, height } = dimensions;
  return {
    ...qianzhiIslandMetrics,
    idle: { ...qianzhiIslandMetrics.idle, width, height },
    compact: { ...qianzhiIslandMetrics.compact, sensorWidth: width, height },
    minimal: { ...qianzhiIslandMetrics.minimal, height },
  } satisfies IslandMetricsOverrides;
}
