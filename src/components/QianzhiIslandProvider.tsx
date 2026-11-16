import { useEffect, useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { IslandProvider } from '../lib/island';
import { resolveIslandReducedMotion } from '../lib/island/preferences';
import { createQianzhiIslandMetrics } from '../lib/island/qianzhi-metrics';
import { qianzhiIslandMotion } from '../lib/island/qianzhi-motion';
import { setHapticsEnabled } from '../lib/haptics';
import { readUserPreferences, useUserPreferences } from '../lib/useUserPreferences';

const QIANZHI_ISLAND_BASELINE_Y_ADJUSTMENT = -10;

export default function QianzhiIslandProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { prefs, setPrefs } = useUserPreferences(session?.user.id ?? null);
  const island = prefs.island;


  // Opt-in development-only frame diagnostics. Open the local site with
  // ?islandProfiler=1 to inspect all patched RAF callbacks; production is unaffected.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('islandProfiler')) return;

    let mounted = true;
    let release: (() => void) | undefined;
    void import('../lib/island/dev-frame-profiler')
      .then(({ acquireIslandFrameProfiler }) => acquireIslandFrameProfiler())
      .then((dispose) => {
        if (mounted) release = dispose;
        else dispose();
      })
      .catch((error) => console.warn('[QianzhiIsland] frame profiler could not start', error));

    return () => {
      mounted = false;
      release?.();
    };
  }, []);

  // Mirror local-first account preference updates from the settings screen so the
  // capsule geometry and position change immediately without a page reload.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    const sync = () => {
      const next = readUserPreferences(uid);
      setPrefs(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const preferenceKey = `qznb_user_preferences_v1:${uid}`;
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== preferenceKey && event.key !== null) return;
      sync();
    };
    window.addEventListener('qznb-settings-changed', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener('qznb-settings-changed', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', syncStorage);
    };
  }, [session?.user.id, setPrefs]);

  const metrics = useMemo(
    () => createQianzhiIslandMetrics({ width: island.width, height: island.height }),
    [island.width, island.height],
  );

  useEffect(() => {
    setHapticsEnabled(island.haptics);
  }, [island.haptics]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--qz-island-config-x', island.offsetX + 'px');
    // Keep the saved offset relative to the tuned default capsule position.
    root.style.setProperty('--qz-island-config-y', (island.offsetY + QIANZHI_ISLAND_BASELINE_Y_ADJUSTMENT) + 'px');
    root.style.setProperty('--qz-island-config-width', island.width + 'px');
    root.style.setProperty('--qz-island-config-half-width', (island.width / 2) + 'px');
    root.style.setProperty('--qz-island-config-height', island.height + 'px');
    return () => {
      root.style.removeProperty('--qz-island-config-x');
      root.style.removeProperty('--qz-island-config-y');
      root.style.removeProperty('--qz-island-config-width');
      root.style.removeProperty('--qz-island-config-half-width');
      root.style.removeProperty('--qz-island-config-height');
    };
  }, [island.offsetX, island.offsetY, island.width, island.height]);

  return (
    <IslandProvider motion={qianzhiIslandMotion} metrics={metrics} reducedMotion={resolveIslandReducedMotion(prefs.motion)}>
      {children}
    </IslandProvider>
  );
}
