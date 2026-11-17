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

/** A small controllable clock for lifecycle races involving delayed press callbacks. */
const makeTimedStore = () => {
  let time = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: (due: number) => void }>();
  const clock: IslandClock = {
    now: () => time,
    onFrame: () => () => {},
    at: (at, run) => {
      const id = nextId++;
      timers.set(id, { at, run });
      return () => timers.delete(id);
    },
  };
  const motion = {
    longPress: 0.5,
    press: {
      decide: 0.15,
      holdReturn: 0.2,
      tapReturn: 0.1,
      releaseReturn: 0.05,
    },
  } as unknown as IslandMotion;
  const advance = (ms: number) => {
    const target = time + ms;
    for (;;) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      timers.delete(next[0]);
      time = next[1].at;
      next[1].run(next[1].at);
    }
    time = target;
  };
  return { store: createIslandStore({ clock, motion: () => motion }), advance };
};


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


describe("multi-activity call coordination", () => {
  it("locks group calls to the full capsule and prevents lower-priority expansion", () => {
    const store = makeStore();
    store.api.start({ id: "music-playback", priority: 0 });
    store.api.start({ id: "upload-task", priority: 22 });
    store.api.start({ id: "qz-group-call-session", priority: 116 });

    let scene = deriveScene(store.getSnapshot());
    expect(scene.presentation.kind).toBe("compact");
    expect(scene.primary?.id).toBe("qz-group-call-session");
    expect(scene.detached).toBeNull();

    store.api.cycle("next");
    store.api.expand("music-playback");
    expect(store.getSnapshot().manualPrimary).toBeNull();
    expect(store.getSnapshot().expanded).toBeNull();

    store.api.expand("qz-group-call-session");
    expect(store.getSnapshot().expanded?.id).toBe("qz-group-call-session");

    // A higher-priority one-to-one call can take over a group call.
    store.api.start({ id: "qz-call-session", priority: 120, alert: true });
    scene = deriveScene(store.getSnapshot());
    expect(scene.presentation.kind).toBe("expanded");
    expect(scene.primary?.id).toBe("qz-call-session");
  });

  it("returns to the manually selected activity after the last call ends", () => {
    const store = makeStore();
    store.api.start({ id: "music-playback", priority: 40 });
    store.api.start({ id: "upload-task", priority: 22 });
    store.api.cycle("next");
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("upload-task");

    store.api.start({ id: "qz-call-session", priority: 120, alert: true });
    expect(store.getSnapshot().expanded?.id).toBe("qz-call-session");

    // A lower-priority notification is retained but cannot expand over the call.
    store.api.start({ id: "qz-alert-message-1", priority: 10, alert: true });
    expect(store.getSnapshot().expanded?.id).toBe("qz-call-session");

    store.api.end("qz-call-session");
    expect(store.getSnapshot().manualPrimary).toBe("upload-task");
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("upload-task");
  });

  it("does not restore an old selection over a higher-priority activity that arrived during the call", () => {
    const store = makeStore();
    store.api.start({ id: "music-playback", priority: 40 });
    store.api.start({ id: "upload-task", priority: 22 });
    store.api.cycle("next");
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("upload-task");

    store.api.start({ id: "qz-call-session", priority: 120 });
    store.api.start({ id: "qz-alert-security", priority: 100, alert: true });
    expect(store.getSnapshot().expanded).toBeNull();

    store.api.end("qz-call-session");
    expect(store.getSnapshot().manualPrimary).toBeNull();
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("qz-alert-security");
  });

  it("collapses a previously expanded non-call activity when a call takes priority", () => {
    const store = makeStore();
    store.api.start({ id: "music-playback", priority: 0 });
    store.api.expand("music-playback");
    expect(store.getSnapshot().expanded?.id).toBe("music-playback");

    store.api.start({ id: "qz-call-session", priority: 120 });
    expect(store.getSnapshot().expanded).toBeNull();
    expect(deriveScene(store.getSnapshot()).primary?.id).toBe("qz-call-session");
  });
});


describe("press lifecycle", () => {
  it("cancels a pending long-press when its activity ends", () => {
    const { store, advance } = makeTimedStore();
    store.api.start({ id: "music-playback" });

    store.press("pill");
    advance(200); // The press is now classified as a long-press, but has not expanded yet.
    expect(store.getSnapshot().pressed).toBe("pill");

    store.api.end("music-playback");

    expect(store.getSnapshot().activities).toHaveLength(0);
    expect(store.getSnapshot().pressed).toBeNull();
    expect(store.getSnapshot().joining).toBeNull();

    advance(500);
    expect(store.getSnapshot().expanded).toBeNull();
    expect(store.getSnapshot().activities).toHaveLength(0);
  });
});
