import { useEffect, useRef, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from './lib/supabase';
import { useAuth } from './auth';
import { getWallpaper } from './lib/wallpaper';
import WallpaperOnboarding from './components/WallpaperOnboarding';
import WelcomeOverlay from './components/WelcomeOverlay';
import FirstLoginProfileSetup from './components/FirstLoginProfileSetup';
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
import Home from './pages/Home';
import Capsule from './pages/Capsule';
import Wishes from './pages/Wishes';
import Events from './pages/Events';
import Greetings from './pages/Greetings';
import MeHub from './pages/MeHub';
import MePosts from './pages/MePosts';
import MeFavorites from './pages/MeFavorites';
import MeGreetings from './pages/MeGreetings';
import MeNotifications from './pages/MeNotifications';
import MeAccount from './pages/MeAccount';
import ErrorBoundary from './components/ErrorBoundary';
import AdminLogin from './pages/AdminLogin';
import Board from './pages/Board';
import HotSnippets from './pages/HotSnippets';
import LoveWall from './pages/LoveWall';
import Explore from './pages/Explore';

const TABS = [
  { to: '/home', label: '首页', ic: '🏠' },
  { to: '/members', label: '班级', ic: '👥' },
  { to: '/explore', label: '互动', ic: '✦' },
  { to: '/timeline', label: '回忆', ic: '🌟' },
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

function isTabActive(tab: string, path: string) {
  if (tab === '/members') return path === '/' || path.startsWith('/members');
  if (tab === '/explore') return ['/explore','/board','/feed','/albums','/friends','/chat','/hot','/greetings','/events','/capsule','/wishes','/love-wall'].some(p => path.startsWith(p));
  if (tab === '/timeline') return path.startsWith('/timeline');
  if (tab === '/me') return path.startsWith('/me');
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
    // 同 main.tsx 的 AdminShell：my_role 8 秒没回结果或报错都按“未通过”处理，
    // 不再永远卡在「加载中…」，而是回到登录页让用户重试。
    const timer = setTimeout(() => { if (live) setRole(''); }, 8000);
    supabase.rpc('my_role').then(
      ({ data, error }) => { clearTimeout(timer); if (live) setRole(error ? '' : (data ?? '')); },
      () => { clearTimeout(timer); if (live) setRole(''); });
    return () => { live = false; clearTimeout(timer); };
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
  const barRef = useRef<HTMLElement>(null);
  // 公告红点：有未读管理员公告时显示
  const [boardUnread, setBoardUnread] = useState(false);
  useEffect(() => {
    if (!session) { setBoardUnread(false); return; }
    let alive = true;
    (async () => {
      try {
        const { data: r } = await supabase.from('board_reads').select('last_seen_at').eq('profile_id', session.user.id).maybeSingle();
        const lastSeen = (r as any)?.last_seen_at as string | undefined;
        let q = supabase.from('board_messages').select('id', { count: 'exact', head: true }).eq('is_admin_msg', true);
        if (lastSeen) q = q.gt('created_at', lastSeen);
        const { count } = await q;
        if (alive) setBoardUnread((count ?? 0) > 0);
      } catch { /* 忽略，红点不影响主流程 */ }
    })();
    return () => { alive = false; };
  }, [session, loc.pathname]);
  useEffect(() => {
    const h = () => setBoardUnread(false);
    window.addEventListener('board-read', h);
    return () => window.removeEventListener('board-read', h);
  }, []);
  // 站内通知红点
  const [notifUnread, setNotifUnread] = useState(false);
  useEffect(() => {
    if (!session) { setNotifUnread(false); return; }
    let alive = true;
    (async () => {
      try {
        const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('profile_id', session.user.id).eq('is_read', false);
        if (alive) setNotifUnread((count ?? 0) > 0);
      } catch {}
    })();
    return () => { alive = false; };
  }, [session, loc.pathname]);
  useEffect(() => {
    const h = () => setNotifUnread(false);
    window.addEventListener('notif-read', h);
    return () => window.removeEventListener('notif-read', h);
  }, []);

  // 登录弹窗公告：按后台设置的次数弹出（1/2/3次或每次）
  const [loginPop, setLoginPop] = useState<any>(null);
  useEffect(() => {
    if (!session || loc.pathname === '/admin') { setLoginPop(null); return; }
    let alive = true;
    (async () => {
      try {
        // 兼容旧版 seen 数组
        let counts: Record<string, number> = {};
        try {
          counts = JSON.parse(localStorage.getItem('ca_popup_counts') || '{}');
          const oldSeen: number[] = JSON.parse(localStorage.getItem('ca_popup_seen') || '[]');
          oldSeen.forEach(id => { if (!(String(id) in counts)) counts[String(id)] = 1; });
        } catch {}
        const now = new Date().toISOString();
        const { data } = await supabase.from('board_messages')
          .select('id, title, content, popup_times, created_at')
          .eq('is_admin_msg', true).eq('popup_on_login', true)
          .is('deleted_at', null)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('created_at', { ascending: false }).limit(10);
        const fresh = (data ?? []).filter(a => (counts[String(a.id)] || 0) < (a.popup_times ?? 1));
        if (alive && fresh.length) setLoginPop(fresh[0]);
      } catch { /* 忽略 */ }
    })();
    return () => { alive = false; };
  }, [session]);
  function closeLoginPop() {
    if (loginPop) {
      try {
        const counts: Record<string, number> = JSON.parse(localStorage.getItem('ca_popup_counts') || '{}');
        counts[String(loginPop.id)] = Math.min((counts[String(loginPop.id)] || 0) + 1, 999);
        localStorage.setItem('ca_popup_counts', JSON.stringify(counts));
      } catch {}
    }
    setLoginPop(null);
  }

  // 全站壁纸（登录后的 onboarding 可改）
  const [wp, setWp] = useState(getWallpaper);
  useEffect(() => {
    const h = () => setWp(getWallpaper());
    window.addEventListener('ca:wallpaper', h);
    return () => window.removeEventListener('ca:wallpaper', h);
  }, []);

  // 首次资料设置只认新注册时写入的 Auth user_metadata 标记；不以 profile_privacy 行是否存在判断。
  const [profileSetupUid, setProfileSetupUid] = useState<string | null>(null);
  useEffect(() => {
    if (!session || loc.pathname === '/admin') { setProfileSetupUid(null); return; }
    const pending = session.user.user_metadata?.first_profile_setup_pending === true;
    let doneHere = false;
    try { doneHere = localStorage.getItem('ca_profile_setup_done_' + session.user.id) === '1'; } catch {}
    if (pending && !doneHere) setProfileSetupUid(session.user.id);
    else setProfileSetupUid(null);
  }, [session, loc.pathname]);

  // 注册带邀请码：欢迎动画要在 App 层播（登录页验证通过会直接卸载，来不及播）
  const [welcome, setWelcome] = useState<string | null>(null);
  const [pwReset, setPwReset] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).has('code')
        || /[?&#]type=recovery/.test(window.location.search + window.location.hash);
    } catch { return false; }
  });
  // 登录后首次：欢迎动画。壁纸不再登录后自动弹，改由「我的」换壁纸手动打开
  const [showWp, setShowWp] = useState(false);
  useEffect(() => {
    if (!session) return;
    if (session.user.user_metadata?.first_profile_setup_pending === true) {
      try { sessionStorage.removeItem('ca_welcome_nick'); } catch {}
      setWelcome(null);
      return;
    }
    let nick: string | null = null;
    try { nick = sessionStorage.getItem('ca_welcome_nick'); sessionStorage.removeItem('ca_welcome_nick'); } catch {}
    if (nick !== null) setWelcome(nick);
  }, [session]);
  useEffect(() => {
    const open = () => setShowWp(true);
    window.addEventListener('ca:wallpaper:open', open);
    return () => window.removeEventListener('ca:wallpaper:open', open);
  }, []);
  function welcomeDone() { setWelcome(null); }


  useEffect(() => {
    if (session) supabase.rpc('my_role').then(({ data }) => setRole(data ?? ''), () => setRole(''));
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
              <Route path="/explore" element={<Explore />} />
              <Route path="/love-wall" element={<LoveWall />} />
              <Route path="/members" element={<Members />} />
              <Route path="/members/:id" element={<Member />} />
              <Route path="/feed" element={<Discover />} />
              <Route path="/albums" element={<Navigate to="/feed" replace />} />
              <Route path="/albums/:id" element={<AlbumDetail />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/chat/:cid" element={<Chat />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/timeline/:uid" element={<Timeline />} />
              <Route path="/me" element={<MeHub />} />
              <Route path="/me/edit" element={<div className="me-compact"><MyProfile /></div>} />
              <Route path="/me/posts" element={<MePosts />} />
              <Route path="/me/favorites" element={<MeFavorites />} />
              <Route path="/me/greetings" element={<MeGreetings />} />
              <Route path="/me/notifications" element={<MeNotifications />} />
              <Route path="/me/account" element={<MeAccount />} />
              <Route path="/greetings" element={<Greetings />} />
              <Route path="/home" element={<Home />} />
              <Route path="/capsule" element={<Capsule />} />
              <Route path="/wishes" element={<Wishes />} />
              <Route path="/events" element={<Events />} />
              <Route path="/hot" element={<HotSnippets />} />
              <Route path="/admin" element={<ErrorBoundary><AdminRoute /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {!isAdminPage && <nav ref={barRef} className="tabbar" style={{ touchAction: 'pan-x pan-y' }}>
        {TABS.map((t, i) => {
          const activeIdx = TABS.findIndex(x => isTabActive(x.to, loc.pathname));
          const on = i === activeIdx;
          return (
            <NavLink key={t.to} to={t.to} className={on ? 'on' : ''}
              ref={on ? (el: any) => { if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' }); } : undefined}>
              <span style={{ position: 'relative', zIndex: 1 }}>{t.label}
                {((t.to === '/explore' && boardUnread) || (t.to === '/me' && notifUnread)) && <span style={{
                  position: 'absolute', top: -2, right: -10, width: 8, height: 8,
                  borderRadius: '50%', background: '#ff4d4f',
                  boxShadow: '0 0 6px #ff4d4f' }} />}</span>
            </NavLink>
          );
        })}
      </nav>}
      {profileSetupUid && <FirstLoginProfileSetup uid={profileSetupUid} onDone={() => {
        try { localStorage.setItem('ca_profile_setup_done_' + profileSetupUid, '1'); } catch {}
        setProfileSetupUid(null);
        setWelcome(null);
        setLoginPop(null);
      }} />}
      {!profileSetupUid && showWp && <WallpaperOnboarding onDone={() => setShowWp(false)} />}
      {!profileSetupUid && welcome !== null && <WelcomeOverlay nick={welcome} onDone={welcomeDone} />}
      {!profileSetupUid && loginPop && (
        <div onClick={closeLoginPop} style={{
          position: 'fixed', inset: 0, zIndex: 300, background: '#000b',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 380, borderRadius: 18, padding: 20,
            background: 'linear-gradient(160deg,#1a2140,#0e1428)',
            border: '1px solid #5b8cff44', boxShadow: '0 20px 60px #000d',
          }}>
            <div style={{ fontSize: 11, color: '#8b93b0', marginBottom: 6 }}>班级公告</div>
            {loginPop.title && <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{loginPop.title}</div>}
            <div style={{ fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: '#fff' }}>{loginPop.content}</div>
            <div style={{ color: 'var(--mut)', fontSize: 11.5, marginTop: 10 }}>
              {(loginPop.created_at || '').slice(0, 16).replace('T', ' ')}
            </div>
            <button onClick={closeLoginPop} style={{
              marginTop: 14, width: '100%', padding: '11px 0', borderRadius: 999, border: 0,
              background: 'linear-gradient(135deg,#5b8cff,#8b5cf6)', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>知道了</button>
          </div>
        </div>
      )}
      <TestSwitchFab />
    </>
  );
}

// main.tsx 已提供 <HashRouter><AuthProvider>，这里只返回 Shell（重复嵌套路由会直接崩溃黑屏）。
export default function App() {
  return <Shell />;
}
