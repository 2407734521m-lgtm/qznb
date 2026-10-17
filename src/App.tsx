import { ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from './auth';
import { configured, supabase } from './lib/supabase';
import Login from './pages/Login';
import Members from './pages/Members';
import Member from './pages/Member';
import MyProfile from './pages/MyProfile';
import Admin from './pages/Admin';

function Page({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div className="wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.25 }}>{children}</motion.div>;
}

export default function App() {
  const loc = useLocation(); const nav = useNavigate(); const { session, loading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    if (!session) { setRole(null); return; }
    supabase.rpc('my_role').then(({ data }) => setRole(data ?? null));
  }, [session]);
  const isAdmin = role === 'admin' || role === 'super_admin';
  if (!configured) return <div className="center"><div className="card">
    缺少环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。请按 README 在 GitHub Secrets 中配置后重新部署。</div></div>;
  if (loading) return <div className="center">加载中…</div>;
  const guard = (el: ReactNode) => session ? <Page>{el}</Page>
    : <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return (
    <>
      <div className="glow" />
      {session && <nav>
        <Link to="/members">成员</Link><Link to="/me">我的档案</Link>
        {isAdmin && <Link to="/admin">管理后台</Link>}<span className="sp" />
        <button onClick={async () => { await supabase.auth.signOut(); nav('/login', { replace: true }); }}>退出登录</button>
      </nav>}
      <AnimatePresence mode="popLayout">
        <Routes location={loc} key={loc.pathname}>
          <Route path="/login" element={session ? <Navigate to="/members" replace /> : <Page><Login /></Page>} />
          <Route path="/members" element={guard(<Members />)} />
          <Route path="/members/:id" element={guard(<Member />)} />
          <Route path="/me" element={guard(<MyProfile />)} />
          <Route path="/admin" element={guard(<Admin />)} />
          <Route path="*" element={<Navigate to="/members" replace />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}
