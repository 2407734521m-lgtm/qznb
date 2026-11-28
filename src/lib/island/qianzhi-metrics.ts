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
   * and volume row. The full player needs about 211px of content plus the
   * expanded padding on a phone, so 224 left only ~13px of slack — on a real
   * phone (Android Chrome range inputs, system font) the volume row, the last
   * row, was cut in half by the card's bottom edge (user screenshot
   * 2026-11-28). 248 keeps headroom for the complete controls while staying
   * well under the oversized 300px expansion on mobile. The cap is a maximum:
   * shorter cards (calls, alerts) still size to their own content.
   */
  expanded: { maxHeight: 248 },
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
