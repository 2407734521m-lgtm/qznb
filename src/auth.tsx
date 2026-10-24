import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

const C = createContext<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
export const useAuth = () => useContext(C);

// 修复：以前 getSession() 一旦没回结果（令牌刷新挂起、锁被别的页签占住等），
// loading 就永远是 true，整站卡在「加载中…」。现在加兜底：
// 1) getSession 报错也结束加载；2) 8 秒还没回结果就先结束加载，显示登录页，
//    用户可以重新登录（登录会写一份新的会话），而不是无限等下去；
// 3) onAuthStateChange 收到会话变化时也结束加载，之后 getSession 回来了再以它为准。
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const finish = (s: Session | null) => {
      if (!alive) return;
      setSession(s);
      setLoading(false);
    };
    const timer = setTimeout(() => { if (alive) setLoading(false); }, 8000);
    supabase.auth.getSession()
      .then(({ data }) => { clearTimeout(timer); finish(data.session); })
      .catch(() => { clearTimeout(timer); if (alive) setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!alive) return;
      setSession(s);
      setLoading(false);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);
  return <C.Provider value={{ session, loading }}>{children}</C.Provider>;
}
