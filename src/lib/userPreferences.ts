import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type QuietHoursPreference = {
  enabled: boolean;
  start: string;
  end: string;
};

export type ChatPreference = {
  sendReadReceipts: boolean;
  showReadReceipts: boolean;
};

export type IslandPreference = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** Short vibration cues for island alerts and gestures (phones that support it). */
  haptics: boolean;
};

export const DEFAULT_ISLAND_PREFERENCE: IslandPreference = {
  offsetX: 0,
  offsetY: 0,
  width: 104,
  height: 31.5,
  haptics: true,
};

export type UserPreferences = {
  motion: 'system' | 'reduce' | 'full';
  notifications: Record<string, boolean>;
  quietHours: QuietHoursPreference;
  chat: ChatPreference;
  island: IslandPreference;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  motion: 'system',
  notifications: {
    comment: true,
    like: true,
    greeting: true,
    notice: true,
    feedback: true,
    love_wall: true,
    admin_message: true,
    moderation: true,
    friend_request: true,
    message: true,
  },
  quietHours: { enabled: false, start: '22:00', end: '07:00' },
  chat: { sendReadReceipts: true, showReadReceipts: true },
  island: DEFAULT_ISLAND_PREFERENCE,
};

function isClockValue(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeUserPreferences(value: unknown): UserPreferences {
  const raw = value && typeof value === 'object' ? value as Record<string, any> : {};
  const quiet = raw.quietHours && typeof raw.quietHours === 'object' ? raw.quietHours : {};
  const chat = raw.chat && typeof raw.chat === 'object' ? raw.chat : {};
  const island = raw.island && typeof raw.island === 'object' ? raw.island : {};
  const notifications = raw.notifications && typeof raw.notifications === 'object' ? raw.notifications : {};
  const bounded = (value: unknown, fallback: number, min: number, max: number, step = 1) => {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.round(Math.min(max, Math.max(min, number)) / step) * step;
  };
  return {
    motion: raw.motion === 'reduce' || raw.motion === 'full' ? raw.motion : 'system',
    notifications: { ...DEFAULT_USER_PREFERENCES.notifications, ...notifications },
    quietHours: {
      enabled: quiet.enabled === true,
      start: isClockValue(quiet.start) ? quiet.start : DEFAULT_USER_PREFERENCES.quietHours.start,
      end: isClockValue(quiet.end) ? quiet.end : DEFAULT_USER_PREFERENCES.quietHours.end,
    },
    chat: {
      sendReadReceipts: chat.sendReadReceipts !== false,
      showReadReceipts: chat.showReadReceipts !== false,
    },
    island: {
      offsetX: bounded(island.offsetX, DEFAULT_ISLAND_PREFERENCE.offsetX, -90, 90),
      offsetY: bounded(island.offsetY, DEFAULT_ISLAND_PREFERENCE.offsetY, -30, 90),
      width: bounded(island.width, DEFAULT_ISLAND_PREFERENCE.width, 88, 144),
      height: bounded(island.height, DEFAULT_ISLAND_PREFERENCE.height, 28, 42, 0.5),
      haptics: island.haptics !== false,
    },
  };
}

export function readCachedUserPreferences(profileId: string | null | undefined): UserPreferences {
  if (!profileId) return DEFAULT_USER_PREFERENCES;
  try {
    const cached = localStorage.getItem('qznb_user_preferences_v1:' + profileId);
    return normalizeUserPreferences(cached ? JSON.parse(cached) : null);
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export function isQuietHoursActive(
  preference: QuietHoursPreference,
  now: Date = new Date(),
): boolean {
  if (!preference.enabled || !isClockValue(preference.start) || !isClockValue(preference.end)) return false;
  const [startHour, startMinute] = preference.start.split(':').map(Number);
  const [endHour, endMinute] = preference.end.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** Account-synced preferences with a local cache for instant UI updates. */
export function useUserPreferences(profileId: string | null | undefined): UserPreferences {
  const [preferences, setPreferences] = useState<UserPreferences>(() => readCachedUserPreferences(profileId));

  useEffect(() => {
    if (!profileId) {
      setPreferences(DEFAULT_USER_PREFERENCES);
      return;
    }
    let active = true;
    const cacheKey = 'qznb_user_preferences_v1:' + profileId;
    const syncLocal = () => setPreferences(readCachedUserPreferences(profileId));
    const syncCloud = async () => {
      const { data, error } = await (supabase as any)
        .from('profile_notification_preferences')
        .select('preferences')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (!active || error || !data?.preferences) return;
      const next = normalizeUserPreferences(data.preferences);
      try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch {}
      setPreferences(next);
    };
    syncLocal();
    void syncCloud();
    window.addEventListener('qznb-settings-changed', syncLocal);
    window.addEventListener('focus', syncCloud);
    return () => {
      active = false;
      window.removeEventListener('qznb-settings-changed', syncLocal);
      window.removeEventListener('focus', syncCloud);
    };
  }, [profileId]);

  return preferences;
}

export function useQuietHoursActive(profileId: string | null | undefined): boolean {
  const preferences = useUserPreferences(profileId);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return isQuietHoursActive(preferences.quietHours, new Date(clock));
}
