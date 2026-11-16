import { describe, expect, it } from "vitest";
import { expandedStageWidth, isMusicExpandedLayer, MUSIC_EXPANDED_STAGE_WIDTH } from "./geometry";

describe("expandedStageWidth", () => {
  it("caps the music player's expanded stage at 500 on desktop", () => {
    expect(expandedStageWidth("music-playback", 640)).toBe(MUSIC_EXPANDED_STAGE_WIDTH);
    expect(MUSIC_EXPANDED_STAGE_WIDTH).toBe(500);
  });

  it("leaves every other activity on the shared stage", () => {
    expect(expandedStageWidth("qz-call-session", 640)).toBe(640);
    expect(expandedStageWidth("qz-route-navigation", 640)).toBe(640);
    expect(expandedStageWidth(null, 640)).toBe(640);
  });

  it("keeps phones on their own narrower container", () => {
    expect(expandedStageWidth("music-playback", 390)).toBe(390);
    expect(expandedStageWidth("music-playback", 320)).toBe(320);
  });
});

describe("isMusicExpandedLayer", () => {
  it("matches the music player's expanded layer with or without a revision", () => {
    expect(isMusicExpandedLayer("expanded:music-playback")).toBe(true);
    expect(isMusicExpandedLayer("expanded:music-playback#2")).toBe(true);
  });

  it("rejects other activities and other presentations", () => {
    expect(isMusicExpandedLayer("expanded:qz-call-session")).toBe(false);
    expect(isMusicExpandedLayer("compact:music-playback")).toBe(false);
    expect(isMusicExpandedLayer("expanded:music-playback-2")).toBe(false);
    expect(isMusicExpandedLayer("expanded:music-playbackx")).toBe(false);
  });
});
