import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

export type GuestIdentity = {
  nickname: string;
  startedAt: number;
  expiresAt: number;
  sessionEpoch: string;
};
const GUEST_SESSION_KEY = 'qznb_guest_identity_v1';

function readGuestIdentity(): GuestIdentity | null {
  try {
    const raw = sessionStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const nickname = typeof parsed?.nickname === 'string' ? parsed.nickname.trim().slice(0, 20) : '';
    const startedAt = Number(parsed?.startedAt);
    const expiresAt = Number(parsed?.expiresAt);
    const sessionEpoch = typeof parsed?.sessionEpoch === 'string' ? parsed.sessionEpoch : '';
    if (!nickname || !Number.isFinite(startedAt) || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now() || !sessionEpoch) {
      sessionStorage.removeItem(GUEST_SESSION_KEY);
      return null;
    }
    return { nickname, startedAt, expiresAt, sessionEpoch };
  } catch {
    try { sessionStorage.removeItem(GUEST_SESSION_KEY); } catch {}
    return null;
  }
}

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  guest: GuestIdentity | null;
  enterGuest: (nickname: string, sessionMinutes: number, sessionEpoch: string) => void;
  leaveGuest: () => void;
};

const C = createContext<AuthContextValue>({
  session: null,
  loading: true,
  guest: null,
  enterGuest: () => {},
  leaveGuest: () => {},
});
export const useAuth = () => useContext(C);

// Guest identity is a tab-scoped browsing convenience only. It never creates
// a Supabase Auth user, profile row, member-presence record, or member count.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState<GuestIdentity | null>(readGuestIdentity);

  function enterGuest(nickname: string, sessionMinutes: number, sessionEpoch: string) {
    const value = nickname.trim().slice(0, 20);
    if (!value) return;
    const minutes = Number.isFinite(sessionMinutes) ? Math.min(1440, Math.max(15, sessionMinutes)) : 60;
    const startedAt = Date.now();
    const identity: GuestIdentity = {
      nickname: value,
      startedAt,
      expiresAt: startedAt + minutes * 60 * 1000,
      sessionEpoch: String(sessionEpoch || '1'),
    };
    try { sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(identity)); } catch {}
    setGuest(identity);
  }

  function leaveGuest() {
    try { sessionStorage.removeItem(GUEST_SESSION_KEY); } catch {}
    setGuest(null);
  }

  useEffect(() => {
    let alive = true;
    const finish = (s: Session | null) => {
      if (!alive) return;
      setSession(s);
      if (s) {
        try { sessionStorage.removeItem(GUEST_SESSION_KEY); } catch {}
        setGuest(null);
      }
      setLoading(false);
    };
    const timer = setTimeout(() => { if (alive) setLoading(false); }, 8000);
    supabase.auth.getSession()
      .then(({ data }) => { clearTimeout(timer); finish(data.session); })
      .catch(() => { clearTimeout(timer); if (alive) setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!alive) return;
      setSession(s);
      if (s) {
        try { sessionStorage.removeItem(GUEST_SESSION_KEY); } catch {}
        setGuest(null);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  // Expiration is anchored to entry time, not extended by activity. Recheck
  // on focus so a suspended mobile browser exits immediately when resumed.
  useEffect(() => {
    if (!guest) return;
    const checkExpiry = () => {
      if (Date.now() >= guest.expiresAt) leaveGuest();
    };
    const interval = window.setInterval(checkExpiry, 10_000);
    window.addEventListener('focus', checkExpiry);
    document.addEventListener('visibilitychange', checkExpiry);
    checkExpiry();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', checkExpiry);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [guest]);

  return <C.Provider value={{ session, loading, guest, enterGuest, leaveGuest }}>{children}</C.Provider>;
}
