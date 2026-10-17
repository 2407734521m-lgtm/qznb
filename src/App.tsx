import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from './lib/supabase';
import { useAuth } from './auth';
import Login from './pages/Login';
import Members from './pages/Members';
import Member from './pages/Member';
import MyProfile from './pages/MyProfile';
import Timeline from './pages/Timeline';
import Album from './pages/Album';
import AlbumDetail from './pages/AlbumDetail';
import Feed from './pages/Feed';
import Admin from './pages/Admin';

const TABS = [
  { to: '/members', label: '成员', ic: '👥' },
  { to: '/feed', label: '动态', ic: '💬' },
  { to: '/albums', label: '相册', ic: '📷' },
  { to: '/timeline', label: '时间线', ic: '✨' },
  { to: '/me', label: '我的', ic: '🙂' },
];

function isTabActive(tab: string, path: string) {
  if (tab === '/members') return path === '/' || path.startsWith('/members');
  if (tab === '/albums') return path.startsWith('/albums');
  if (tab === '/timeline') return path.startsWith('/timeline');
  return path === tab;
}

function Shell() {
  const { session, loading } = useAuth();
  const [role, setRole] = useState('');
  const loc = useLocation();
  const reduce = useReducedMotion();
  const isAdmin = role === 'admin' || role === 'super_admin';

  useEffect(() => {
    if (session) supabase.rpc('my_role').then(({ data }) => setRole(data ?? ''));
    else setRole('');
  }, [session]);

  async function logout() { await supabase.auth.signOut(); }

  if (loading) return <div className="center">加载中…</div>;
  if (!session) return (<><div className="glow" /><Login /></>);

  return (
    <>
      <div className="glow" />
      <nav className="topnav">
        <span className="brand">青春档案</span>
        <span className="links">
          {TABS.map(t => (
            <NavLink key={t.to} to={t.to} className={isTabActive(t.to, loc.pathname) ? 'on' : ''}>{t.label}</NavLink>
          ))}
          {isAdmin && <NavLink to="/admin" className={loc.pathname === '/admin' ? 'on' : ''}>管理后台</NavLink>}
        </span>
        <span className="sp" />
        {isAdmin && <a href="#/admin" title="管理后台" className="mob-admin" style={{ textDecoration: 'none', marginRight: 4 }}>⚙️</a>}
        <button onClick={logout} title="退出登录">退出</button>
      </nav>

      <div className="wrap">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: reduce ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] }}>
            <Routes location={loc}>
              <Route path="/" element={<Navigate to="/members" replace />} />
              <Route path="/members" element={<Members />} />
              <Route path="/members/:id" element={<Member />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/albums" element={<Album />} />
              <Route path="/albums/:id" element={<AlbumDetail />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/timeline/:uid" element={<Timeline />} />
              <Route path="/me" element={<MyProfile />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/members" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      <nav className="tabbar">
        {TABS.map(t => (
          <NavLink key={t.to} to={t.to} className={isTabActive(t.to, loc.pathname) ? 'on' : ''}>
            <span className="ic">{t.ic}</span>{t.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

// main.tsx 已提供 <HashRouter><AuthProvider>，这里只返回 Shell（重复嵌套路由会直接崩溃黑屏）。
export default function App() {
  return <Shell />;
}
