import { useEffect, useRef, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from './lib/supabase';
import { useAuth } from './auth';
import { getWallpaper, isOnboarded } from './lib/wallpaper';
import WallpaperOnboarding from './components/WallpaperOnboarding';
import WelcomeOverlay from './components/WelcomeOverlay';
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
  const nav = useNavigate();
  const touchX = useRef<number | null>(null);
  const barRef = useRef<HTMLElement>(null);
  // 拖拽 scrub：手指按住底栏滑动时，高亮 pill 实时跟随
  const [scrub, setScrub] = useState<number | null>(null);

  // 全站壁纸（登录后的 onboarding 可改）
  const [wp, setWp] = useState(getWallpaper);
  useEffect(() => {
    const h = () => setWp(getWallpaper());
    window.addEventListener('ca:wallpaper', h);
    return () => window.removeEventListener('ca:wallpaper', h);
  }, []);

  // 注册带邀请码：欢迎动画要在 App 层播（登录页验证通过会直接卸载，来不及播）
  const [welcome, setWelcome] = useState<string | null>(null);
  // 登录后首次：全屏过渡 + 选壁纸（有欢迎动画时等它播完再弹）
  const [showWp, setShowWp] = useState(false);
  useEffect(() => {
    if (!session) return;
    let nick: string | null = null;
    try { nick = sessionStorage.getItem('ca_welcome_nick'); sessionStorage.removeItem('ca_welcome_nick'); } catch {}
    if (nick !== null) setWelcome(nick);
    else if (!isOnboarded()) setShowWp(true);
  }, [session]);
  useEffect(() => {
    const open = () => setShowWp(true);
    window.addEventListener('ca:wallpaper:open', open);
    return () => window.removeEventListener('ca:wallpaper:open', open);
  }, []);
  function welcomeDone() { setWelcome(null); if (!isOnboarded()) setShowWp(true); }

  // 按住底栏拖拽：高亮实时跟随手指，松手切换（像 iPhone 小横条 scrub）
  function tabFromX(clientX: number): number | null {
    const links = barRef.current?.querySelectorAll('a');
    if (!links || links.length === 0) return null;
    let best = -1, bestD = Infinity;
    links.forEach((a, i) => {
      const r = a.getBoundingClientRect();
      if (clientX >= r.left - 8 && clientX <= r.right + 8) { best = i; bestD = -1; }
      else if (bestD >= 0) {
        const d = Math.abs(clientX - (r.left + r.width / 2));
        if (d < bestD) { bestD = d; best = i; }
      }
    });
    return best;
  }
  function tabTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
    setScrub(tabFromX(e.touches[0].clientX));
  }
  function tabTouchMove(e: React.TouchEvent) {
    if (touchX.current == null) return;
    setScrub(tabFromX(e.touches[0].clientX));
  }
  function tabTouchEnd(e: React.TouchEvent) {
    const sx = touchX.current;
    const target = scrub;
    touchX.current = null; setScrub(null);
    if (sx == null) return;
    let ni: number | null = target;
    if (ni == null) { // 快滑：没有 move 事件时按位移方向切
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) < 40) return;
      const idx = TABS.findIndex(t => isTabActive(t.to, loc.pathname));
      if (idx < 0) return;
      ni = idx + (dx < 0 ? 1 : -1);
    }
    if (ni >= 0 && ni < TABS.length) {
      const cur = TABS.findIndex(t => isTabActive(t.to, loc.pathname));
      if (ni !== cur) nav(TABS[ni].to);
    }
  }
  function tabTouchCancel() { touchX.current = null; setScrub(null); }

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
      <div className="app-bg" style={wp.kind === 'grad'
        ? { background: wp.src, filter: `blur(${wp.blur}px) brightness(${100 - wp.dark}%)` }
        : { backgroundImage: `url(${wp.src === 'default' ? bgUrl : wp.src})`, filter: `blur(${wp.blur}px) brightness(${100 - wp.dark}%)` }} />
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

      {!isAdminPage && <nav ref={barRef} className="tabbar"
        onTouchStart={tabTouchStart} onTouchMove={tabTouchMove}
        onTouchEnd={tabTouchEnd} onTouchCancel={tabTouchCancel}
        style={{ touchAction: 'pan-y' }}>
        {TABS.map((t, i) => {
          const activeIdx = TABS.findIndex(x => isTabActive(x.to, loc.pathname));
          const pill = scrub ?? activeIdx;
          const on = i === activeIdx;
          return (
            <NavLink key={t.to} to={t.to} className={on ? 'on' : ''}
              style={{ position: 'relative', ...(i === pill ? { background: 'transparent' } : {}) }}>
              {i === pill && <motion.span layoutId="tab-glass"
                transition={{ type: 'spring', stiffness: 550, damping: 38 }}
                style={{ position: 'absolute', inset: 0, borderRadius: 999,
                  background: 'linear-gradient(135deg,var(--a),var(--b))',
                  boxShadow: '0 4px 16px color-mix(in srgb,var(--a) 45%,transparent)' }} />}
              <span style={{ position: 'relative', zIndex: 1 }}>{t.label}</span>
            </NavLink>
          );
        })}
      </nav>}
      {showWp && <WallpaperOnboarding onDone={() => setShowWp(false)} />}
      {welcome !== null && <WelcomeOverlay nick={welcome} onDone={welcomeDone} />}
    </>
  );
}

// main.tsx 已提供 <HashRouter><AuthProvider>，这里只返回 Shell（重复嵌套路由会直接崩溃黑屏）。
export default function App() {
  return <Shell />;
}
