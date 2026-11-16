import { afterEach, describe, expect, it, vi } from "vitest";
import { createPausableDismissTimer } from "./islandTaskDismissTimer";

afterEach(() => vi.useRealTimers());

describe("createPausableDismissTimer", () => {
  it("pauses the remaining time while the activity list is open", () => {
    vi.useFakeTimers();
    const onElapsed = vi.fn();
    const timer = createPausableDismissTimer(onElapsed);

    timer.restart(4000);
    vi.advanceTimersByTime(1200);
    timer.pause();
    expect(timer.remaining).toBe(2800);

    vi.advanceTimersByTime(10000);
    expect(onElapsed).not.toHaveBeenCalled();

    timer.resume();
    vi.advanceTimersByTime(2799);
    expect(onElapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it("stays paused across restart and can be cancelled", () => {
    vi.useFakeTimers();
    const onElapsed = vi.fn();
    const timer = createPausableDismissTimer(onElapsed);

    timer.pause();
    timer.restart(2000);
    vi.advanceTimersByTime(5000);
    expect(onElapsed).not.toHaveBeenCalled();

    timer.cancel();
    timer.resume();
    vi.advanceTimersByTime(5000);
    expect(onElapsed).not.toHaveBeenCalled();
  });
});
