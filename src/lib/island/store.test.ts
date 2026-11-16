import { describe, expect, it } from "vitest";
import { deriveScene, type IslandSnapshot } from "./store";
import type { Activity } from "./types";

const makeActivity = (id: string, order: number): Activity => ({
  id,
  label: id,
  priority: 0,
  order,
  content: {
    compact: { leading: id + "-compact" },
    minimal: id + "-minimal",
  },
  onPress: null,
  revision: 0,
  group: null,
});

const makeSnapshot = (activities: readonly Activity[]): IslandSnapshot => ({
  activities,
  expanded: null,
  changeId: 0,
  changedAt: 0,
  instant: false,
  pressed: null,
  joining: null,
  front: {},
  handoff: null,
});

describe("deriveScene", () => {
  it("keeps route loading in one capsule while retaining the secondary activity", () => {
    const navigation = makeActivity("qz-route-navigation", 0);
    const music = makeActivity("music-playback", 1);
    const snapshot = makeSnapshot([navigation, music]);

    const scene = deriveScene(snapshot);

    expect(scene.presentation).toEqual({
      kind: "compact",
      leading: "qz-route-navigation-compact",
    });
    expect(scene.primary?.id).toBe("qz-route-navigation");
    expect(scene.detached).toBeNull();
    expect(snapshot.activities.map((activity) => activity.id)).toEqual([
      "qz-route-navigation",
      "music-playback",
    ]);
  });

  it("keeps a minimized call in the full capsule while retaining secondary activities", () => {
    const call = makeActivity("qz-call-session", 0);
    const music = makeActivity("music-playback", 1);
    const snapshot = makeSnapshot([call, music]);

    const scene = deriveScene(snapshot);

    expect(scene.presentation).toEqual({
      kind: "compact",
      leading: "qz-call-session-compact",
    });
    expect(scene.primary?.id).toBe("qz-call-session");
    expect(scene.detached).toBeNull();
    expect(snapshot.activities.map((activity) => activity.id)).toEqual([
      "qz-call-session",
      "music-playback",
    ]);
  });

  it("keeps the detached bubble for other combinations of activities", () => {
    const music = makeActivity("music-playback", 0);
    const download = makeActivity("download-task", 1);

    const scene = deriveScene(makeSnapshot([music, download]));

    expect(scene.presentation.kind).toBe("minimal");
    expect(scene.detached?.id).toBe("download-task");
  });
});
