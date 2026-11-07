import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

export type GuestIdentity = { nickname: string };
const GUEST_SESSION_KEY = 'qznb_guest_identity_v1';

function readGuestIdentity(): GuestIdentity | null {
  try {
    const raw = sessionStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const nickname = typeof parsed?.nickname === 'string' ? parsed.nickname.trim().slice(0, 20) : '';
    return nickname ? { nickname } : null;
  } catch {
    return null;
  }
}

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  guest: GuestIdentity | null;
  enterGuest: (nickname: string) => void;
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

// A guest is a tab-scoped, local-only browsing identity. It never creates a
// Supabase Auth user, profile row, member-presence record, or member count.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState<GuestIdentity | null>(readGuestIdentity);

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

  function enterGuest(nickname: string) {
    const value = nickname.trim().slice(0, 20);
    if (!value) return;
    const identity = { nickname: value };
    try { sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(identity)); } catch {}
    setGuest(identity);
  }

  function leaveGuest() {
    try { sessionStorage.removeItem(GUEST_SESSION_KEY); } catch {}
    setGuest(null);
  }

  return <C.Provider value={{ session, loading, guest, enterGuest, leaveGuest }}>{children}</C.Provider>;
}
