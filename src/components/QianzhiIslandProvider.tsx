import { useEffect, useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { IslandProvider } from '../lib/island';
import { createQianzhiIslandMetrics } from '../lib/island/qianzhi-metrics';
import { qianzhiIslandMotion } from '../lib/island/qianzhi-motion';
import { setHapticsEnabled } from '../lib/haptics';
import { readUserPreferences, useUserPreferences } from '../lib/useUserPreferences';

export default function QianzhiIslandProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { prefs, setPrefs } = useUserPreferences(session?.user.id ?? null);
  const island = prefs.island;

  // Mirror local-first account preference updates from the settings screen so the
  // capsule geometry and position change immediately without a page reload.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    const sync = () => {
      const next = readUserPreferences(uid);
      setPrefs(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    window.addEventListener('qznb-settings-changed', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('qznb-settings-changed', sync);
      window.removeEventListener('focus', sync);
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
    // Raise the default capsule position by 10px; the setting remains a relative adjustment.
    root.style.setProperty('--qz-island-config-y', (island.offsetY - 10) + 'px');
    root.style.setProperty('--qz-island-config-width', island.width + 'px');
    root.style.setProperty('--qz-island-config-height', island.height + 'px');
    return () => {
      root.style.removeProperty('--qz-island-config-x');
      root.style.removeProperty('--qz-island-config-y');
      root.style.removeProperty('--qz-island-config-width');
      root.style.removeProperty('--qz-island-config-height');
    };
  }, [island.offsetX, island.offsetY, island.width, island.height]);

  return (
    <IslandProvider motion={qianzhiIslandMotion} metrics={metrics}>
      {children}
    </IslandProvider>
  );
}
