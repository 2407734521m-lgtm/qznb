import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { DEFAULT_USER_PREFERENCES, normalizeUserPreferences, type UserPreferences } from './userPreferences';

export type PreferencesSyncState = 'loading' | 'saved' | 'error';

export function readUserPreferences(uid: string): UserPreferences {
  try {
    const raw = JSON.parse(localStorage.getItem('qznb_user_preferences_v1:' + uid) || 'null');
    return normalizeUserPreferences(raw);
  } catch { return DEFAULT_USER_PREFERENCES; }
}

// 账号级偏好：本地 localStorage 即时生效 + 云端 profile_notification_preferences 同步。
// 原本写在设置页里，2026-11-07 设置子页拆分后抽成共用 hook，设置页与各子页共用同一份逻辑。
export function useUserPreferences(uid: string) {
  const [prefs, setPrefs] = useState<UserPreferences>(() => readUserPreferences(uid));
  const [prefsReady, setPrefsReady] = useState(false);
  const [syncState, setSyncState] = useState<PreferencesSyncState>('loading');

  useEffect(() => {
    let active = true;
    async function loadCloudPreferences() {
      const localPreferences = readUserPreferences(uid);
      const { data, error } = await (supabase as any).from('profile_notification_preferences').select('preferences').eq('profile_id', uid).maybeSingle();
      if (!active) return;
      if (error) {
        setPrefs(localPreferences); setSyncState('error'); setPrefsReady(true); return;
      }
      if (data?.preferences && typeof data.preferences === 'object') {
        const remote = data.preferences as Partial<UserPreferences>;
        setPrefs(normalizeUserPreferences({
          ...localPreferences,
          ...remote,
          notifications: { ...DEFAULT_USER_PREFERENCES.notifications, ...localPreferences.notifications, ...(remote.notifications || {}) },
          chat: { ...localPreferences.chat, ...(remote.chat || {}) },
          quietHours: { ...localPreferences.quietHours, ...(remote.quietHours || {}) },
        }));
        setSyncState('saved');
      } else {
        const { error: insertError } = await (supabase as any).from('profile_notification_preferences').upsert({ profile_id: uid, preferences: localPreferences }, { onConflict: 'profile_id' });
        if (!active) return;
        setPrefs(localPreferences); setSyncState(insertError ? 'error' : 'saved');
      }
      setPrefsReady(true);
    }
    void loadCloudPreferences();
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    if (!prefsReady) return;
    try { localStorage.setItem('qznb_user_preferences_v1:' + uid, JSON.stringify(prefs)); } catch {}
    try { localStorage.setItem('qznb_motion_preference_v1', prefs.motion); } catch {}
    window.dispatchEvent(new Event('qznb-settings-changed'));
    let active = true;
    const timer = window.setTimeout(async () => {
      const { error } = await (supabase as any).from('profile_notification_preferences').upsert({ profile_id: uid, preferences: prefs }, { onConflict: 'profile_id' });
      if (active) setSyncState(error ? 'error' : 'saved');
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [prefs, uid, prefsReady]);

  return { prefs, setPrefs, prefsReady, syncState };
}
