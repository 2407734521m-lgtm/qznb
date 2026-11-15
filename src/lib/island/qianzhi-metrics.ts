import type { IslandMetricsOverrides } from './config';

/**
 * Qianzhi's web island profile: a slightly longer, slimmer compact capsule.
 * The upstream engine remains unchanged; only the public-site presentation is tuned.
 */
export const qianzhiIslandMetrics = {
  top: 12.5,
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
} satisfies IslandMetricsOverrides;
