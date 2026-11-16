import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { DEFAULT_USER_PREFERENCES, normalizeUserPreferences, type UserPreferences } from './userPreferences';

export type PreferencesSyncState = 'loading' | 'saved' | 'error';

export function readUserPreferences(uid: string | null | undefined): UserPreferences {
  if (!uid) return DEFAULT_USER_PREFERENCES;
  try {
    const raw = JSON.parse(localStorage.getItem('qznb_user_preferences_v1:' + uid) || 'null');
    return normalizeUserPreferences(raw);
  } catch { return DEFAULT_USER_PREFERENCES; }
}

/**
 * Whether this account has a local preference cache at all. A missing cache
 * means "the cache was deleted" (another tab, cleared storage) — it must
 * never be read as "the user reset everything to defaults", or the defaults
 * would be written back to the cloud over the user's real settings.
 */
export function hasLocalPreferences(uid: string | null | undefined): boolean {
  if (!uid) return false;
  try { return localStorage.getItem('qznb_user_preferences_v1:' + uid) !== null; } catch { return false; }
}

// 离线写云端失败后的重试间隔与上限；联网恢复时由 online 事件立即再试，
// 不必等到重试耗尽。
const CLOUD_RETRY_DELAY_MS = 10_000;
const CLOUD_RETRY_MAX_ATTEMPTS = 6;

// 账号级偏好：本地 localStorage 即时生效 + 云端 profile_notification_preferences 同步。
// 原本写在设置页里，2026-11-07 设置子页拆分后抽成共用 hook，设置页与各子页共用同一份逻辑。
export function useUserPreferences(uid: string | null | undefined) {
  const [prefs, setPrefs] = useState<UserPreferences>(() => readUserPreferences(uid));
  const [prefsReady, setPrefsReady] = useState(false);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<PreferencesSyncState>('loading');
  const [reloadNonce, setReloadNonce] = useState(0);
  const prevUidRef = useRef<string | null | undefined>(uid);
  const prefsRef = useRef(prefs);
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 从云端重读一次偏好（本地缓存被删时用）：不碰内存里的当前偏好，等云端
  // 返回再合并，避免先闪一下默认值。
  const reloadPreferences = useCallback(() => { setReloadNonce(nonce => nonce + 1); }, []);

  const flushToCloud = useCallback(async (next: UserPreferences, forUid: string): Promise<boolean> => {
    const { error } = await (supabase as any).from('profile_notification_preferences').upsert({ profile_id: forUid, preferences: next }, { onConflict: 'profile_id' });
    return !error;
  }, []);

  // 推一次云端；失败则留着待同步定时再试（最多 CLOUD_RETRY_MAX_ATTEMPTS 次），
  // 联网恢复时 online 监听会立即再推一次，不必等到重试耗尽。
  const flushWithRetry = useCallback(async (next: UserPreferences, forUid: string, resetCount = false): Promise<void> => {
    if (resetCount) retryCountRef.current = 0;
    if (retryTimerRef.current) { window.clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    const ok = await flushToCloud(next, forUid);
    if (!mountedRef.current) return;
    setSyncState(ok ? 'saved' : 'error');
    if (!ok && retryCountRef.current < CLOUD_RETRY_MAX_ATTEMPTS) {
      retryCountRef.current += 1;
      retryTimerRef.current = window.setTimeout(() => {
        void flushWithRetry(prefsRef.current, forUid);
      }, CLOUD_RETRY_DELAY_MS);
    }
  }, [flushToCloud]);

  useEffect(() => {
    const uidChanged = prevUidRef.current !== uid;
    prevUidRef.current = uid;
    if (uidChanged) {
      // 账号切换时立刻换成新账号自己的本地缓存，不要让新账号的页面
      // 在云端返回前一直用着旧账号的设置。
      setPrefs(readUserPreferences(uid));
      setLoadedUid(null);
      setPrefsReady(false);
    }
    setSyncState('loading');
    if (!uid) {
      setPrefs(DEFAULT_USER_PREFERENCES);
      setLoadedUid(null);
      setSyncState('saved');
      setPrefsReady(true);
      return;
    }
    let active = true;
    async function loadCloudPreferences() {
      const localPreferences = readUserPreferences(uid);
      const { data, error } = await (supabase as any).from('profile_notification_preferences').select('preferences').eq('profile_id', uid).maybeSingle();
      if (!active) return;
      if (error) {
        setPrefs(localPreferences); setSyncState('error'); setLoadedUid(uid ?? null); setPrefsReady(true); return;
      }
      if (data?.preferences && typeof data.preferences === 'object') {
        const remote = data.preferences as Partial<UserPreferences>;
        setPrefs(normalizeUserPreferences({
          ...localPreferences,
          ...remote,
          notifications: { ...DEFAULT_USER_PREFERENCES.notifications, ...localPreferences.notifications, ...(remote.notifications || {}) },
          chat: { ...localPreferences.chat, ...(remote.chat || {}) },
          quietHours: { ...localPreferences.quietHours, ...(remote.quietHours || {}) },
          island: { ...localPreferences.island, ...(remote.island || {}) },
        }));
        setSyncState('saved');
      } else {
        const { error: insertError } = await (supabase as any).from('profile_notification_preferences').upsert({ profile_id: uid, preferences: localPreferences }, { onConflict: 'profile_id' });
        if (!active) return;
        setPrefs(localPreferences); setSyncState(insertError ? 'error' : 'saved');
      }
      setLoadedUid(uid ?? null);
      setPrefsReady(true);
    }
    void loadCloudPreferences();
    return () => { active = false; };
  }, [uid, reloadNonce]);

  useEffect(() => {
    if (!prefsReady || !uid || loadedUid !== uid) return;
    try { localStorage.setItem('qznb_user_preferences_v1:' + uid, JSON.stringify(prefs)); } catch {}
    try { localStorage.setItem('qznb_motion_preference_v1', prefs.motion); } catch {}
    window.dispatchEvent(new Event('qznb-settings-changed'));
    // 离线改设置不能只记一次 error 就丢掉：300ms 防抖后推云端，失败留待同步再试。
    const timer = window.setTimeout(() => { void flushWithRetry(prefs, uid, true); }, 300);
    return () => { window.clearTimeout(timer); };
  }, [prefs, uid, prefsReady, loadedUid, flushWithRetry]);

  // 联网恢复时立即把待同步的偏好推上云端，不必等重试计时器。
  useEffect(() => {
    const onOnline = () => {
      if (!uid || syncState !== 'error') return;
      void flushWithRetry(prefsRef.current, uid, true);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [uid, syncState, flushWithRetry]);

  useEffect(() => () => {
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
  }, []);

  return { prefs, setPrefs, prefsReady, syncState, reloadPreferences };
}
