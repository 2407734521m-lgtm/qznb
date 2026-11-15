import { combineIslandAlertBatch, type IslandAlertInput } from './QianzhiIslandAlert';

interface ShownAlert {
  end(): void;
}

export interface IslandAlertSchedulerOptions {
  /** Puts one alert on the island. Its `onEnd` must fire once when the alert leaves, however it ends. */
  show: (input: IslandAlertInput) => ShownAlert;
  /** False during quiet hours or while the page is hidden: nothing is shown and nothing is kept. */
  canShow: () => boolean;
}

/** A burst of realtime inserts becomes one concise heads-up. */
const BURST_MS = 420;
/** Gives the island time to finish its dismiss motion before the next alert starts. */
const NEXT_MS = 450;
const MAX_WAITING = 8;

/**
 * Decides what the island's single alert slot shows. The notification center stays the source of
 * truth; the island is a short, low-noise heads-up, so alerts are merged rather than dropped:
 * an alert of equal or higher priority folds into the one on screen (the count adds up), and a
 * lower-priority one waits and is shown, merged with its peers, once the current alert is gone.
 */
export function createIslandAlertScheduler({ show, canShow }: IslandAlertSchedulerOptions) {
  type Entry = { input: IslandAlertInput; handle: ShownAlert; done: boolean };
  let disposed = false;
  let burst: IslandAlertInput[] = [];
  let waiting: IslandAlertInput[] = [];
  let active: Entry | null = null;
  let burstTimer: ReturnType<typeof setTimeout> | null = null;
  let nextTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (burstTimer !== null) clearTimeout(burstTimer);
    if (nextTimer !== null) clearTimeout(nextTimer);
    burstTimer = null;
    nextTimer = null;
  };

  const present = (input: IslandAlertInput) => {
    let next = input;
    if (active) {
      if (input.priority < active.input.priority) {
        waiting.push(input);
        if (waiting.length > MAX_WAITING) waiting.shift();
        return;
      }
      next = combineIslandAlertBatch([active.input, input]) ?? input;
      const previous = active;
      active = null;
      previous.done = true;
      previous.handle.end();
    }
    const entry: Entry = { input: next, handle: { end() {} }, done: false };
    entry.handle = show({
      ...next,
      onEnd: () => {
        if (entry.done) return;
        entry.done = true;
        if (active === entry) {
          active = null;
          scheduleWaiting();
        }
      },
    });
    active = entry;
  };

  function scheduleWaiting() {
    if (waiting.length === 0 || nextTimer !== null) return;
    nextTimer = setTimeout(() => {
      nextTimer = null;
      if (disposed || active) return; // a newer alert took the slot; its own end reschedules
      const items = waiting.splice(0);
      if (!canShow()) return;
      const combined = combineIslandAlertBatch(items);
      if (combined) present(combined);
    }, NEXT_MS);
  }

  return {
    enqueue(input: IslandAlertInput) {
      if (disposed || !canShow()) return;
      burst.push(input);
      if (burstTimer !== null) return;
      burstTimer = setTimeout(() => {
        burstTimer = null;
        const items = burst.splice(0);
        if (disposed || !canShow()) return;
        const combined = combineIslandAlertBatch(items);
        if (combined) present(combined);
      }, BURST_MS);
    },
    /** Closes the alert on screen and forgets everything waiting behind it. */
    dismiss() {
      clearTimers();
      burst = [];
      waiting = [];
      active?.handle.end();
    },
    dispose() {
      disposed = true;
      clearTimers();
      burst = [];
      waiting = [];
      const current = active;
      active = null;
      if (current) {
        current.done = true;
        current.handle.end();
      }
    },
  };
}
