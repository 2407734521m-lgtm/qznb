import type { ReducedMotionSetting } from "./types";

export type IslandMotionPreference = "system" | "reduce" | "full";

/**
 * Maps the account setting to the island engine's system-aware reduced-motion contract.
 * "full" still respects the system setting (the settings page says so): it only
 * means "don't force reduced motion yourself". Only "reduce" forces it on.
 * This mirrors the app-level rule in resolveMotionReduced (userPreferences):
 * reduced whenever the account says reduce, or the system does.
 */
export function resolveIslandReducedMotion(preference: IslandMotionPreference): ReducedMotionSetting {
  if (preference === "reduce") return "always";
  return "user";
}
