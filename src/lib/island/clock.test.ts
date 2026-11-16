import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrameClock } from "./clock";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createFrameClock callback isolation", () => {
  it("continues timers and frame listeners after an individual callback throws", () => {
    let time = 0;
    let nextId = 1;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, "now").mockImplementation(() => time);
    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const id = nextId++;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (id: number) => {
        frames.delete(id);
      },
    } as unknown as Window);

    const errors: unknown[] = [];
    const events: string[] = [];
    const clock = createFrameClock({ onError: error => errors.push(error) });
    const timerError = new Error("timer failed");
    const frameError = new Error("frame failed");

    clock.at(10, () => {
      throw timerError;
    });
    clock.at(10, () => events.push("timer"));

    const stopBrokenFrame = clock.onFrame(() => {
      throw frameError;
    });
    const stopGoodFrame = clock.onFrame(() => events.push("frame"));

    const flushFrame = () => {
      const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!next) throw new Error("No animation frame was scheduled");
      frames.delete(next[0]);
      next[1](time);
    };

    time = 10;
    flushFrame();

    expect(errors).toEqual([timerError, frameError]);
    expect(events).toEqual(["timer", "frame"]);
    expect(frames.size).toBe(1);

    stopBrokenFrame();
    stopGoodFrame();
    flushFrame();
    expect(frames.size).toBe(0);
  });
});
