type TimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * A one-shot auto-dismiss timer that pauses while a user is inspecting the task list.
 * restart() keeps the paused state, so a task that completes while the list is open
 * remains visible until the list is closed.
 */
export function createPausableDismissTimer(onElapsed: () => void) {
  let timeout: TimeoutHandle | null = null;
  let remainingMs = 0;
  let deadline = 0;
  let paused = false;
  let disposed = false;

  const clearTimeoutHandle = () => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
  };

  const schedule = () => {
    if (disposed || paused || remainingMs <= 0) return;
    deadline = Date.now() + remainingMs;
    timeout = setTimeout(() => {
      timeout = null;
      remainingMs = 0;
      if (!disposed && !paused) onElapsed();
    }, remainingMs);
  };

  return {
    restart(delayMs: number) {
      if (disposed) return;
      clearTimeoutHandle();
      remainingMs = Math.max(0, Number.isFinite(delayMs) ? delayMs : 0);
      schedule();
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      if (timeout !== null) {
        remainingMs = Math.max(0, deadline - Date.now());
        clearTimeoutHandle();
      }
    },
    resume() {
      if (disposed || !paused) return;
      paused = false;
      schedule();
    },
    cancel() {
      clearTimeoutHandle();
      remainingMs = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeoutHandle();
      remainingMs = 0;
    },
    get isPaused() {
      return paused;
    },
    get remaining() {
      return timeout !== null ? Math.max(0, deadline - Date.now()) : remainingMs;
    },
  };
}
