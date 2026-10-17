import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

const C = createContext<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
export const useAuth = () => useContext(C);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return <C.Provider value={{ session, loading }}>{children}</C.Provider>;
}
