import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from './lib/supabase';
import { useAuth } from './auth';
import bgUrl from './assets/bg.jpg';
import Login from './pages/Login';
import Members from './pages/Members';
import Member from './pages/Member';
import MyProfile from './pages/MyProfile';
import Timeline from './pages/Timeline';
import AlbumDetail from './pages/AlbumDetail';
import Discover from './pages/Discover';
import Friends from './pages/Friends';
import Chat from './pages/Chat';
import Admin from './pages/Admin';

const TABS = [
  { to: '/members', label: '成员', ic: '👥' },
  { to: '/feed', label: '动态', ic: '✨' },
  { to: '/friends', label: '好友', ic: '💌' },
  { to: '/timeline', label: '时间线', ic: '🌟' },
  { to: '/me', label: '我的', ic: '🙂' },
];

function isTabActive(tab: string, path: string) {
  if (tab === '/members') return path === '/' || path.startsWith('/members');
  if (tab === '/feed') return path.startsWith('/feed') || path.startsWith('/albums');
  if (tab === '/friends') return path.startsWith('/friends') || path.startsWith('/chat');
  if (tab === '/timeline') return path.startsWith('/timeline');
  return path === tab;
}

function Shell() {
  const { session, loading } = useAuth();
  const [role, setRole] = useState('');
  const loc = useLocation();
  const reduce = useReducedMotion();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isAdminPage = loc.pathname === '/admin';

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
      <div className="app-bg" style={{ backgroundImage: `url(${bgUrl})` }} />
      {isAdminPage ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', position: 'sticky', top: 0, zIndex: 40, background: 'rgba(10,12,20,.78)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <b style={{ fontSize: 15 }}>🛠️ 管理后台</b>
          <span style={{ flex: 1 }} />
          <NavLink to="/members" style={{ fontSize: 13, color: '#9db4ff', textDecoration: 'none' }}>← 回站点</NavLink>
          <button className="mini ghost" onClick={logout}>退出</button>
        </div>
      ) : (
      <nav className="topnav">
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
      )}

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
              <Route path="/feed" element={<Discover />} />
              <Route path="/albums" element={<Navigate to="/feed" replace />} />
              <Route path="/albums/:id" element={<AlbumDetail />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/chat/:cid" element={<Chat />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/timeline/:uid" element={<Timeline />} />
              <Route path="/me" element={<div className="me-compact"><MyProfile /></div>} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/members" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {!isAdminPage && <nav className="tabbar">
        {TABS.map(t => (
          <NavLink key={t.to} to={t.to} className={isTabActive(t.to, loc.pathname) ? 'on' : ''}>{t.label}</NavLink>
        ))}
      </nav>}
    </>
  );
}

// main.tsx 已提供 <HashRouter><AuthProvider>，这里只返回 Shell（重复嵌套路由会直接崩溃黑屏）。
export default function App() {
  return <Shell />;
}
