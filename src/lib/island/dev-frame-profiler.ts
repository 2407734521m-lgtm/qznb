import Tempus from "tempus";
import { profiler } from "tempus/profiler";

type Dispose = () => void;

let leases = 0;
let startPromise: Promise<Dispose> | null = null;
let activeDispose: Dispose | null = null;

/**
 * Acquires the opt-in development frame profiler. Tempus patches requestAnimationFrame only
 * while at least one development provider owns a lease; cleanup restores the native functions.
 */
export const acquireIslandFrameProfiler = async (): Promise<Dispose> => {
  leases += 1;

  if (!startPromise) {
    startPromise = Promise.resolve().then(() => {
      Tempus.patch();
      try {
        const panel = profiler({ corner: "bottom-right", fps: 5 });
        return () => {
          panel.destroy();
          Tempus.unpatch();
        };
      } catch (error) {
        Tempus.unpatch();
        throw error;
      }
    }).then((dispose) => {
      activeDispose = dispose;
      return dispose;
    }).catch((error) => {
      leases = Math.max(0, leases - 1);
      startPromise = null;
      throw error;
    });
  }

  try {
    await startPromise;
  } catch (error) {
    throw error;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    leases = Math.max(0, leases - 1);
    if (leases !== 0) return;
    activeDispose?.();
    activeDispose = null;
    startPromise = null;
  };
};
