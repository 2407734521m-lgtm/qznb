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
import ErrorBoundary from './components/ErrorBoundary';
import AdminLogin from './pages/AdminLogin';
import Board from './pages/Board';

const TABS = [
  { to: '/board', label: '公告', ic: '📢' },
  { to: '/members', label: '成员', ic: '👥' },
  { to: '/feed', label: '动态', ic: '✨' },
  { to: '/friends', label: '好友', ic: '💌' },
  { to: '/timeline', label: '时间线', ic: '🌟' },
  { to: '/me', label: '我的', ic: '🙂' },
];

// 从 UA 里提取设备型号（如 Android 的机型标识），供管理员在成员管理里查看
function parseDevice(ua: string): string {
  const m = ua.match(/Android [\d.]+; ([^;)]+)/);
  if (m) return m[1].trim().slice(0, 40);
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Windows/.test(ua)) return 'Windows 电脑';
  if (/Mac OS/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

function isTabActive(tab: string, path: string) {  if (tab === '/board') return path.startsWith('/board');
  if (tab === '/members') return path === '/' || path.startsWith('/members');
  if (tab === '/feed') return path.startsWith('/feed') || path.startsWith('/albums');
  if (tab === '/friends') return path.startsWith('/friends') || path.startsWith('/chat');
  if (tab === '/timeline') return path.startsWith('/timeline');
  return path === tab;
}

// 测试账号快切：从管理后台一键切换登录后，各页面右下角悬浮"结束测试"一键切回
// （只有走过管理后台切换流程的人才看得到，普通用户没有）
function TestSwitchFab() {
  const { session } = useAuth();
  const [testingAs, setTestingAs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try { setTestingAs(sessionStorage.getItem('ca_testing_as')); } catch { setTestingAs(null); }
  }, [session]);
  if (!session || !testingAs) return null;
  async function back() {
    if (busy) return;
    setBusy(true);
    let accounts: { email: string; password: string }[] = [];
    let fromEmail = '';
    try {
      accounts = JSON.parse(localStorage.getItem('ca_test_accounts') || '[]');
      fromEmail = sessionStorage.getItem('ca_testing_from') || '';
      sessionStorage.removeItem('ca_testing_as');
      sessionStorage.removeItem('ca_testing_from');
    } catch {}
    const acc = accounts.find(a => a.email === fromEmail);
    await supabase.auth.signOut();
    if (acc) {
      const { error } = await supabase.auth.signInWithPassword({ email: acc.email, password: acc.password });
      if (error) alert('切回失败，请手动登录：' + error.message);
    }
    setBusy(false);
  }
  return (
    <button onClick={back} disabled={busy}
      style={{
        position: 'fixed', right: 14, bottom: 92, zIndex: 200, padding: '10px 15px', borderRadius: 999,
        border: '1px solid #ffffff2e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        background: 'color-mix(in srgb, #1a1e30 72%, transparent)', backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 24px #000a', opacity: busy ? 0.6 : 1,
      }}>⇄ {busy ? '切换中…' : '结束测试'}</button>
  );
}

// /admin 路由守卫：已是管理员直接进后台，否则显示独立的管理员登录页
function AdminRoute() {
  const { session, loading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    if (!session) { setRole(null); return; }
    let live = true;
    supabase.rpc('my_role').then(({ data }) => { if (live) setRole(data ?? ''); });
    return () => { live = false; };
  }, [session]);
  if (loading || (session && role === null)) return <div className="center" style={{ minHeight: '60vh' }}>加载中…</div>;
  const isAdmin = role === 'admin' || role === 'super_admin';
  return isAdmin ? <ErrorBoundary><Admin /></ErrorBoundary> : <AdminLogin />;
}

// 密码重置：从重置邮件点链接回来（URL 带 code），在这里设置新密码
function ResetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  async function doReset() {
    if (pw.length < 8) return setErr('密码至少 8 位');
    if (pw !== pw2) return setErr('两次输入的密码不一致');
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr('设置失败：' + error.message + '（链接可能过期了，重新发一封重置邮件吧）');
    setOk(true);
  }
  return (
    <div style={{ minHeight: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="login-card">
        <h1 style={{ fontSize: 20 }}>🔑 重置密码</h1>
        <p className="sub">设 置 新 密 码</p>
        {ok ? (<>
          <p className="priv-note">✓ 密码已重置，下次用新密码登录</p>
          <button className="pri" onClick={onDone}>进入班级</button>
        </>) : (<>
          <label>新密码</label>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="至少 8 位"
            autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && doReset()} />
          <label>确认新密码</label>
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="再输一次"
            autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && doReset()} />
          {err && <p className="err">{err}</p>}
          <button className="pri" disabled={busy} onClick={doReset}>{busy ? '设置中…' : '设置新密码'}</button>
        </>)}
      </div>
    </div>
  );
}

function Shell() {
  const { session, loading } = useAuth();  const [role, setRole] = useState('');
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
  const [pwReset, setPwReset] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).has('code')
        || /[?&#]type=recovery/.test(window.location.search + window.location.hash);
    } catch { return false; }
  });
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

  // 上报设备与位置（管理员可见）：静默执行，失败不打扰用户
  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    (async () => {
      try {
        const device = parseDevice(navigator.userAgent || '');
        let location = '';
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 6000);
          const r = await fetch('https://ipapi.co/json/', { signal: ctl.signal }).then(x => x.json());
          clearTimeout(t);
          location = [r.region, r.city].filter(Boolean).join(' ') || (r.country_name || '');
        } catch { /* 位置解析失败就只记设备 */ }
        await supabase.from('member_presence').upsert(
          { profile_id: uid, device: device || null, location: location || null, updated_at: new Date().toISOString() },
          { onConflict: 'profile_id' });
      } catch { /* 上报失败不打扰用户 */ }
    })();
  }, [session]);

  async function logout() { await supabase.auth.signOut(); }

  if (loading) return <div className="center">加载中…</div>;
  if (!session) return isAdminPage
    ? (<><div className="glow" /><div style={{ position: 'fixed', inset: 0, background: '#07090f' }} /><div style={{ position: 'relative' }}><AdminLogin /></div></>)
    : (<><div className="glow" /><Login /></>);
  // 从重置密码邮件回来：优先显示设置新密码页
  if (pwReset) return (<><div className="glow" /><ResetPassword onDone={() => {
    setPwReset(false);
    try { window.history.replaceState(null, '', window.location.pathname + window.location.hash); } catch {}
  }} /></>);

  return (
    <>
      <div className="glow" />
      <div className="app-bg" style={wp.kind === 'grad'
        ? { background: wp.src, filter: `blur(${wp.blur}px) brightness(${100 - wp.dark}%)` }
        : { backgroundImage: `url(${wp.src === 'default' ? bgUrl : wp.src})`, filter: `blur(${wp.blur}px) brightness(${100 - wp.dark}%)` }} />
      {isAdminPage ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', position: 'sticky', top: 0, zIndex: 40, background: 'rgba(10,12,20,.78)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <b style={{ fontSize: 15 }}>管理后台</b>
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
        {isAdmin && <a href="#/admin" title="管理后台" className="mob-admin" style={{ textDecoration: 'none', marginRight: 4, fontSize: 13 }}>管理</a>}
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
              <Route path="/board" element={<Board />} />
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
              <Route path="/admin" element={<ErrorBoundary><AdminRoute /></ErrorBoundary>} />
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
      <TestSwitchFab />
    </>
  );
}

// main.tsx 已提供 <HashRouter><AuthProvider>，这里只返回 Shell（重复嵌套路由会直接崩溃黑屏）。
export default function App() {
  return <Shell />;
}
