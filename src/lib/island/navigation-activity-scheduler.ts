export const NAVIGATION_ACTIVITY_SHOW_DELAY_MS = 180;
export const NAVIGATION_ACTIVITY_MIN_VISIBLE_MS = 1_500;
export const NAVIGATION_ACTIVITY_END_DEBOUNCE_MS = 500;

export interface NavigationActivitySink {
  /** Starts the activity, or updates its content when the ID is already active. */
  show(label: string): void;
  end(): void;
}

export interface NavigationActivityTimerDriver<Handle> {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): Handle;
  clearTimeout(handle: Handle): void;
}

/**
 * Coalesces route-loading fallback mounts into one island activity.
 *
 * A fast route load never flashes the island. Once shown, the activity gets a minimum
 * presentation window. A nearby route transition cancels the pending end and updates
 * the current label instead of creating another activity.
 */
export class NavigationActivityScheduler<Handle> {
  private pendingStart: Handle | null = null;
  private pendingEnd: Handle | null = null;
  private visibleSince: number | null = null;
  private latestLabel = '';
  private sink: NavigationActivitySink | null = null;

  constructor(private readonly timers: NavigationActivityTimerDriver<Handle>) {}

  enter(sink: NavigationActivitySink, label: string): void {
    this.sink = sink;
    this.latestLabel = label;

    if (this.pendingEnd !== null) {
      this.timers.clearTimeout(this.pendingEnd);
      this.pendingEnd = null;
    }

    if (this.visibleSince !== null) {
      // Re-entering during the quiet window is the same activity, not a new presentation.
      sink.show(label);
      return;
    }

    if (this.pendingStart !== null) return;

    this.pendingStart = this.timers.setTimeout(() => {
      this.pendingStart = null;
      this.visibleSince = this.timers.now();
      this.sink?.show(this.latestLabel);
    }, NAVIGATION_ACTIVITY_SHOW_DELAY_MS);
  }

  update(label: string): void {
    this.latestLabel = label;
    if (this.visibleSince !== null) this.sink?.show(label);
  }

  leave(): void {
    // The route finished before the show delay: cancel it without flashing the island.
    if (this.pendingStart !== null) {
      this.timers.clearTimeout(this.pendingStart);
      this.pendingStart = null;
    }

    if (this.visibleSince === null) {
      this.sink = null;
      return;
    }

    if (this.pendingEnd !== null) this.timers.clearTimeout(this.pendingEnd);

    const visibleFor = Math.max(0, this.timers.now() - this.visibleSince);
    const remainingMinimum = Math.max(0, NAVIGATION_ACTIVITY_MIN_VISIBLE_MS - visibleFor);
    const endDelay = Math.max(NAVIGATION_ACTIVITY_END_DEBOUNCE_MS, remainingMinimum);

    this.pendingEnd = this.timers.setTimeout(() => {
      this.pendingEnd = null;
      this.visibleSince = null;
      const activeSink = this.sink;
      this.sink = null;
      activeSink?.end();
    }, endDelay);
  }

  /** Test and teardown helper; not used during normal navigation. */
  reset(): void {
    if (this.pendingStart !== null) this.timers.clearTimeout(this.pendingStart);
    if (this.pendingEnd !== null) this.timers.clearTimeout(this.pendingEnd);
    this.pendingStart = null;
    this.pendingEnd = null;
    const wasVisible = this.visibleSince !== null;
    this.visibleSince = null;
    const activeSink = this.sink;
    this.sink = null;
    if (wasVisible) activeSink?.end();
  }
}
