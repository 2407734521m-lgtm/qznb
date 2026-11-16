import { describe, expect, it } from "vitest";
import { resolveIslandReducedMotion } from "./preferences";

describe("resolveIslandReducedMotion", () => {
  it("forces reduced motion when the account preference is reduce", () => {
    expect(resolveIslandReducedMotion("reduce")).toBe("always");
  });

  it("keeps the full motion profile when explicitly selected", () => {
    expect(resolveIslandReducedMotion("full")).toBe("never");
  });

  it("follows the operating system when set to system", () => {
    expect(resolveIslandReducedMotion("system")).toBe("user");
  });
});
