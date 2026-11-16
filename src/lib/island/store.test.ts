import { describe, expect, it } from "vitest";
import type { IslandClock } from "./clock";
import type { IslandMotion } from "./motion";
import { createIslandStore, deriveScene, type IslandSnapshot } from "./store";
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

const makeSnapshot = (activities: readonly Activity[], manualPrimary: string | null = null): IslandSnapshot => ({
  activities,
  expanded: null,
  changeId: 0,
  changedAt: 0,
  instant: false,
  pressed: null,
  joining: null,
  front: {},
  manualPrimary,
  handoff: null,
});

const makeActivityWithPriority = (id: string, order: number, priority: number): Activity => ({
  ...makeActivity(id, order),
  priority,
});

/** A clock that never fires: `cycle()` needs no timers, so the stub stays inert. */
const stubClock: IslandClock = {
  now: () => 0,
  onFrame: () => () => {},
  at: () => () => {},
};

const makeStore = () => createIslandStore({ clock: stubClock, motion: () => ({}) as IslandMotion });

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

describe("swipe to cycle activities", () => {
  it("brings the swipe-chosen activity to the front without changing priorities", () => {
    const music = makeActivityWithPriority("music-playback", 0, 0);
    const download = makeActivityWithPriority("download-task", 1, 22);

    const scene = deriveScene(makeSnapshot([download, music], "music-playback"));

    expect(scene.presentation.kind).toBe("minimal");
    expect(scene.primary?.id).toBe("music-playback");
    expect(scene.detached?.id).toBe("download-task");
    expect(download.priority).toBe(22);
    expect(music.priority).toBe(0);
  });

  it("ignores a swipe choice for an activity that no longer shows", () => {
    const music = makeActivity("music-playback", 0);

    const scene = deriveScene(makeSnapshot([music], "gone-activity"));

    expect(scene.primary?.id).toBe("music-playback");
  });

  it("walks through every shown activity and wraps around", () => {
    const store = makeStore();
    store.api.start({ id: "music-playback", priority: 0 });
    store.api.start({ id: "upload-task", priority: 22 });
    store.api.start({ id: "download-task", priority: 22 });

    // Priority order: upload, download, music.
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("upload-task");
    store.api.cycle("next");
    let scene = deriveScene(store.getSnapshot());
    expect(scene.primary?.id).toBe("download-task");
    expect(scene.detached?.id).toBe("upload-task");
    store.api.cycle("next");
    scene = deriveScene(store.getSnapshot());
    expect(scene.primary?.id).toBe("music-playback");
    expect(scene.detached?.id).toBe("upload-task");
    store.api.cycle("next");
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("upload-task");
    store.api.cycle("previous");
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("music-playback");
  });

  it("does nothing with one activity, while expanded, or while a call holds the capsule", () => {
    const single = makeStore();
    single.api.start({ id: "music-playback", priority: 0 });
    single.api.cycle("next");
    expect(deriveScene(single.getSnapshot()).primary?.id).toBe("music-playback");
    expect(single.getSnapshot().manualPrimary).toBeNull();

    const expanded = makeStore();
    expanded.api.start({ id: "music-playback", priority: 0 });
    expanded.api.start({ id: "upload-task", priority: 22 });
    expanded.api.expand("music-playback");
    expanded.api.cycle("next");
    expect(expanded.getSnapshot().manualPrimary).toBeNull();
    expect(deriveScene(expanded.getSnapshot()).primary?.id).toBe("music-playback");

    const calling = makeStore();
    calling.api.start({ id: "music-playback", priority: 0 });
    calling.api.start({ id: "qz-call-session", priority: 120 });
    calling.api.cycle("next");
    expect(deriveScene(calling.getSnapshot()).primary?.id).toBe("qz-call-session");
    expect(calling.getSnapshot().manualPrimary).toBeNull();
  });

  it("lets a newer, higher-priority arrival take the front back", () => {
    const store = makeStore();
    store.api.start({ id: "music-playback", priority: 0 });
    store.api.start({ id: "upload-task", priority: 22 });
    store.api.cycle("next");
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("music-playback");

    store.api.start({ id: "qz-alert-1", priority: 36 });

    expect(store.getSnapshot().manualPrimary).toBeNull();
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("qz-alert-1");
  });

  it("keeps the swipe choice when a lower-priority activity arrives, and clears it when the chosen one ends", () => {
    const store = makeStore();
    store.api.start({ id: "music-playback", priority: 0 });
    store.api.start({ id: "upload-task", priority: 22 });
    store.api.start({ id: "download-task", priority: 22 });
    store.api.cycle("next");
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("download-task");

    store.api.start({ id: "qz-route-navigation", priority: 14 });

    expect(store.getSnapshot().manualPrimary).toBe("download-task");
    store.api.end("download-task");
    expect(store.getSnapshot().manualPrimary).toBeNull();
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("upload-task");
  });
});
