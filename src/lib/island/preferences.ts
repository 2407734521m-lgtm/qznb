import type { ReducedMotionSetting } from "./types";

export type IslandMotionPreference = "system" | "reduce" | "full";

/** Maps the account setting to the island engine's system-aware reduced-motion contract. */
export function resolveIslandReducedMotion(preference: IslandMotionPreference): ReducedMotionSetting {
  if (preference === "reduce") return "always";
  if (preference === "full") return "never";
  return "user";
}
