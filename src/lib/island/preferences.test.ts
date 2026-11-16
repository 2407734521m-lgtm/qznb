import { describe, expect, it } from "vitest";
import { resolveIslandReducedMotion } from "./preferences";

describe("resolveIslandReducedMotion", () => {
  it("forces reduced motion when the account preference is reduce", () => {
    expect(resolveIslandReducedMotion("reduce")).toBe("always");
  });

  it("still follows the operating system when full motion is selected", () => {
    // The settings page promises full motion still respects the system's
    // reduced-motion setting; "never" would ignore it.
    expect(resolveIslandReducedMotion("full")).toBe("user");
  });

  it("follows the operating system when set to system", () => {
    expect(resolveIslandReducedMotion("system")).toBe("user");
  });
});
