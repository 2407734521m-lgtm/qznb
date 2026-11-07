import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LiquidGlass } from 'simple-liquid-glass';
import { LiquidGlassNav } from './components/liquid-glass-dock';
import RdevLiquidGlass from 'liquid-glass-react';
import CodeInput from './components/CodeInput';
import { LiquidGlassScene } from 'simple-liquid-glass/backdrop';
import { DUR, EASE } from './lib/motion';
import { supabase } from './lib/supabase';
import { startSitePresence } from './lib/sitePresence';
import { useAuth } from './auth';
import { getWallpaper } from './lib/wallpaper';
import { useQuietHoursActive } from './lib/userPreferences';
import WallpaperOnboarding from './components/WallpaperOnboarding';
import BlurText from './components/fx/BlurText';
import ShinyText from './components/fx/ShinyText';
import FxLoader from './components/fx/Loader';
import WelcomeOverlay from './components/WelcomeOverlay';
import GuideCarousel from './components/GuideCarousel';
import LoginSuccessOverlay from './components/LoginSuccessOverlay';
import bgUrl from './assets/bg.jpg';
import emblemUrl from './assets/pingzhong-emblem.png';
import Login from './pages/Login';
import GuestNicknameDialog from './components/GuestNicknameDialog';
import GuestBrowse from './pages/GuestBrowse';
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
import MemoryCalendar from './pages/MemoryCalendar';
import Wishes from './pages/Wishes';
import Events from './pages/Events';
import Greetings from './pages/Greetings';
import MeHub from './pages/MeHub';
import MeContent from './pages/MeContent';
import MePosts from './pages/MePosts';
import MeFavorites from './pages/MeFavorites';
import MeGreetings from './pages/MeGreetings';
import MeNotifications from './pages/MeNotifications';
import MeFeedback from './pages/MeFeedback';
import MeAccount from './pages/MeAccount';
import MeSettings from './pages/MeSettings';
import MePasskey from './pages/MePasskey';
import MePrivacy from './pages/MePrivacy';
import MeDevices from './pages/MeDevices';
import MeGeneral from './pages/MeGeneral';
import MeNotifySettings from './pages/MeNotifySettings';
import MeGrowth from './pages/MeGrowth';
import ErrorBoundary from './components/ErrorBoundary';
import AdminLogin from './pages/AdminLogin';
import Board from './pages/Board';
import HotSnippets from './pages/HotSnippets';
import LoveWall from './pages/LoveWall';
import Explore from './pages/Explore';
import SongWall from './pages/SongWall';
import Daily from './pages/Daily';
import ParticleFlower from './pages/ParticleFlower';
import AirInk from './pages/AirInk';
import { alertDialog } from './lib/dialog';
import GlobalSearch from './components/GlobalSearch';

// Dock 保留四个最高频入口；其余页面通过长按 Dock 打开的玻璃快捷面板访问。
const TABS = [
  { to: '/home', label: '首页' },
  { to: '/explore', label: '发现' },
  { to: '/friends', label: '私聊' },
  { to: '/me', label: '我的' },
];

function DockIcon({ kind, unread = false }: {
  kind: 'home' | 'explore' | 'friends' | 'me';
  unread?: boolean;
}) {
  return (
    <span className="qz26-dock-icon-wrap">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {kind === 'home' && (
          <>
            <path d="m3.8 10.6 8.2-6.8 8.2 6.8v8.1a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8v-8.1Z" />
            <path d="M9 20.5v-6.7h6v6.7" />
          </>
        )}
        {kind === 'explore' && (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="m15.7 8.3-2.4 5-5 2.4 2.4-5 5-2.4Z" />
          </>
        )}
        {kind === 'friends' && (
          <>
            <path d="M20 11.4a7.4 7.4 0 0 1-7.4 7.4H5l1.4-3.1A7.4 7.4 0 1 1 20 11.4Z" />
            <path d="M8.8 11.5h.1M12 11.5h.1M15.2 11.5h.1" strokeWidth="2.3" />
          </>
        )}
        {kind === 'me' && (
          <>
            <circle cx="12" cy="8" r="3.4" />
            <path d="M4.5 20c.8-3.1 3.4-4.9 7.5-4.9s6.7 1.8 7.5 4.9" />
          </>
        )}
      </svg>
      {unread && <i className="qz26-dock-unread" />}
    </span>
  );
}

const DOCK_MORE_TABS = [
  { to: '/board', label: '公告' },
  { to: '/members', label: '班级' },
  { to: '/me/notifications', label: '消息' },
  { to: '/songs', label: '歌声墙' },
  { to: '/love-wall', label: '表白墙' },
  { to: '/daily', label: '日常' },
  { to: '/timeline', label: '回忆' },
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
  if (tab === '/home') return path.startsWith('/home') || path.startsWith('/board');
  if (tab === '/board') return path.startsWith('/board');
  if (tab === '/members') return path.startsWith('/members');
  if (tab === '/explore') return ['/explore','/feed','/albums','/hot','/greetings','/events','/capsule','/wishes','/particle-flower','/air-ink','/calendar'].some(p => path.startsWith(p));
  if (tab === '/friends') return ['/friends','/chat'].some(p => path.startsWith(p));
  if (tab === '/songs') return path.startsWith('/songs');
  if (tab === '/love-wall') return path.startsWith('/love-wall');
  if (tab === '/daily') return path.startsWith('/daily');
  if (tab === '/timeline') return path.startsWith('/timeline');
  if (tab === '/me/notifications') return path.startsWith('/me/notifications');
  if (tab === '/me') return path.startsWith('/me') && !path.startsWith('/me/notifications');
  return path === tab;
}

// /admin 路由守卫：已是管理员直接进后台，否则显示独立的管理员登录页
function AdminRoute() {
  const { session, loading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [verifiedUid, setVerifiedUid] = useState<string | null>(null);
  useEffect(() => {
    setRole(null);
    setVerifiedUid(null);
    if (!session) return;
    let live = true;
    const uid = session.user.id;
    const markUnavailable = () => {
      if (!live) return;
      setRole('');
      setVerifiedUid(uid);
    };
    // Keep the legacy route's independent guard bound to the current session identity.
    const timer = setTimeout(markUnavailable, 8000);
    supabase.rpc('my_role').then(
      ({ data, error }) => {
        clearTimeout(timer);
        if (!live) return;
        setRole(error ? '' : (data ?? ''));
        setVerifiedUid(uid);
      },
      () => {
        clearTimeout(timer);
        markUnavailable();
      }
    );
    return () => { live = false; clearTimeout(timer); };
  }, [session?.user.id]);
  if (loading || (session && (role === null || verifiedUid !== session.user.id))) {
    return <div className="center" style={{ minHeight: '60vh' }}><FxLoader text="加载中…" /></div>;
  }
  const isAdmin = Boolean(session) && (role === 'admin' || role === 'super_admin');
  return isAdmin
    ? <ErrorBoundary><Admin verifiedRole={role === 'super_admin' ? 'super_admin' : 'admin'} /></ErrorBoundary>
    : <AdminLogin />;
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
        <h1 style={{ fontSize: 20 }}>重置密码</h1>
        <p className="sub">设 置 新 密 码</p>
        {ok ? (<>
          <p className="priv-note">✓ 密码已重置，下次用新密码登录</p>
          <button className="pri" onClick={onDone}>进入青春档案</button>
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

// 维护模式：主站默认显示维护页；管理员可进入 /admin，持有有效临时通行码的访客可临时绕过此页。
function MaintenanceScreen({ title, msg, hasSession, onLogout, onAccessGranted }: { title: string; msg: string; hasSession: boolean; onLogout: () => void; onAccessGranted: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  const [subNote, setSubNote] = useState('');
  const [subDone, setSubDone] = useState(false);
  async function subscribe() {
    const em = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setSubNote('请填写正确的邮箱地址'); return; }
    setSubBusy(true); setSubNote('');
    const { error: insErr } = await supabase.from('maintenance_notify_emails').insert({ email: em });
    setSubBusy(false);
    if (!insErr || (insErr as any).code === '23505') setSubDone(true);
    else setSubNote('登记失败，请稍后重试');
  }
  async function redeem() {
    if (code.length !== 6 || [...code].some(ch => ch < '0' || ch > '9')) { setError('请输入完整的六位数验证码'); return; }
    setBusy(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('maintenance_redeem_code', { p_code: code });
      if (rpcError) throw rpcError;
      if (!data?.ok || !data?.token) { setError(data?.message || '验证码无效、已过期或已撤销'); return; }
      try { sessionStorage.setItem('ca_maintenance_access', data.token); } catch {}
      setCode('');
      onAccessGranted();
    } catch (e: any) {
      setError(e?.message || '验证失败，请稍后重试');
    } finally { setBusy(false); }
  }
  return (<><div className="glow" /><div style={{ minHeight: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div className="login-card" style={{ textAlign: 'center', width: '100%', maxWidth: 430 }}>
      <h1 style={{ fontSize: 22 }}>{title || '系统维护中'}</h1>
      <p className="sub">我们的班级 · 青春档案</p>
      <p style={{ fontSize: 15, lineHeight: 1.8, margin: '18px 0 22px' }}>{msg || '系统维护中，稍后再来'}</p>
      <label style={{ display: 'block', textAlign: 'left', marginBottom: 7 }}>临时访问验证码</label>
      <CodeInput value={code} onChange={v => { setCode(v); setError(''); }} onEnter={() => void redeem()} disabled={busy} />
      {error && <p className="err" role="alert">{error}</p>}
      <button className="pri" disabled={busy || code.length !== 6} onClick={() => void redeem()}>{busy ? '验证中…' : '验证并进入'}</button>
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #ffffff14' }}>
        <p style={{ fontSize: 13, color: 'var(--mut)', margin: '0 0 10px', lineHeight: 1.7 }}>没有验证码？留下邮箱，网站恢复后我们会第一时间发邮件通知你。</p>
        {subDone ? <p style={{ fontSize: 13.5, color: '#7ee2a8', margin: 0 }}>已登记，网站恢复后会发邮件到 {email.trim().toLowerCase()}</p> : (<>
          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setSubNote(''); }} placeholder="填写您的邮箱地址" autoComplete="email" />
          {subNote && <p className="err" role="alert">{subNote}</p>}
          <button className="mini" style={{ marginTop: 10 }} disabled={subBusy} onClick={() => void subscribe()}>{subBusy ? '登记中…' : '恢复后邮件通知我'}</button>
        </>)}
      </div>
      {hasSession && <button className="mini ghost" style={{ marginTop: 12 }} onClick={onLogout}>退出登录</button>}
    </div>
  </div></>);
}

function LoginClosedScreen({ onGuestLogin, showGuestEntry }: { onGuestLogin: () => void; showGuestEntry: boolean }) {
  const nav = useNavigate();
  return (<><div className="glow" /><div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <section className="login-card" style={{ width: '100%', maxWidth: 430, textAlign: 'center' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: '#7a8494' }}>ACCESS NOTICE</div>
      <h1 style={{ fontSize: 23, margin: '12px 0' }}>登录入口暂未开放</h1>
      <p style={{ color: 'var(--mut)', lineHeight: 1.8, fontSize: 14 }}>管理员暂时关闭了登录与注册入口，请稍后再来。</p>
      {showGuestEntry && <button className="pri" style={{ marginTop: 12 }} onClick={onGuestLogin}>游客登录（仅浏览）</button>}
      <button className="mini ghost" style={{ marginTop: 12 }} onClick={() => nav('/admin')}>管理员入口</button>
    </section>
  </div></>);
}

function PublicLanding({ data, onLogin, onGuestLogin, showGuestEntry }: { data: any; onLogin: () => void; onGuestLogin: () => void; showGuestEntry: boolean }) {
  const nav = useNavigate();
  const notices = Array.isArray(data?.notices) ? data.notices : [];
  const title = data?.site_title || '我们的班级';
  const subtitle = data?.site_subtitle || '青春档案';
  const bannerText = data?.home_banner_text || '把我们的青春，留在这里';
  const bannerUrl = typeof data?.home_banner_url === 'string' && (data.home_banner_url.startsWith('https://') || data.home_banner_url.startsWith('http://')) ? data.home_banner_url : '';
  const heroImg = bannerUrl;
  return (<><div className="glow" /><img src={emblemUrl} alt="" aria-hidden draggable={false}
      style={{ position: 'absolute', top: 68, right: 12, width: 88, opacity: 0.32, pointerEvents: 'none', userSelect: 'none', zIndex: 30 }} /><main style={{ width: 'min(100% - 28px, 820px)', margin: '0 auto', padding: '22px 0 48px', color: '#202632' }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 11, letterSpacing: 3, color: '#7b8492' }}>OUR CLASS · PUBLIC SPACE</div><h1 style={{ margin: '6px 0 0', fontSize: 24 }}>{title}</h1><p style={{ margin: '4px 0 0', color: '#737b89', fontSize: 13 }}><ShinyText text={subtitle} /></p></div>
      {data?.close_login_entry !== 'true' && <button className="pri" style={{ width: 'auto', padding: '10px 16px', whiteSpace: 'nowrap' }} onClick={onLogin}>登录 / 注册</button>}
    </header>
    <section style={{ aspectRatio: '16 / 9', width: '100%', position: 'relative', overflow: 'hidden', borderRadius: 22, marginBottom: 18, background: '#e9edf3', border: '1px solid #e5e8ee', boxShadow: '0 12px 34px #202a3d0c' }}>
      {heroImg && <img src={heroImg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, padding: 'clamp(18px,5vw,30px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: heroImg ? 'linear-gradient(90deg,#10182873,transparent 70%)' : 'linear-gradient(145deg,#f7f9fc,#e9eef5)' }}>
        <div className="landing-hero-glass qz-liquid-glass-strong">
          <div style={{ fontSize: 10, letterSpacing: 2, color: heroImg ? '#fff' : 'var(--qz26-muted)' }}>ANNOUNCEMENTS</div>
          <h2 style={{ margin: '8px 0 0', color: heroImg ? '#fff' : 'var(--qz26-ink)', fontSize: 'clamp(20px,5vw,30px)', lineHeight: 1.3 }}><BlurText key={bannerText} text={bannerText} /></h2>
        </div>
      </div>
    </section>
    <section style={{ background: '#fff', border: '1px solid #e9ebf0', borderRadius: 20, padding: '18px clamp(14px,4vw,22px)', boxShadow: '0 8px 28px #202a3d0a' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}><h2 style={{ margin: 0, fontSize: 18 }}>校园公告</h2><span style={{ fontSize: 11, color: '#87909d' }}>公开内容</span></div>
      {notices.length ? notices.map((n: any, i: number) => <article key={n.id ?? i} style={{ padding: '13px 0', borderTop: '1px solid #edf0f4' }}>
        {n.title && <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>{n.title}</h3>}
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 14, color: '#4b5563' }}>{n.content}</p>
        {n.created_at && <div style={{ marginTop: 7, color: '#9aa2ae', fontSize: 11 }}>{new Date(n.created_at).toLocaleString()}</div>}
      </article>) : <p style={{ color: '#87909d', fontSize: 13 }}>暂时没有公开公告。</p>}
    </section>
    <footer style={{ textAlign: 'center', padding: '22px 0 0', color: '#929aa6', fontSize: 12 }}>访客浏览模式 · 登录后可使用完整社区功能</footer>
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
      <button className="mini ghost" onClick={() => nav('/admin')}>管理员入口</button>
      {showGuestEntry && <button className="mini ghost" onClick={onGuestLogin}>游客登录</button>}
      {data?.close_login_entry !== 'true' && <button className="mini ghost" onClick={onLogin}>进入账号</button>}
    </div>
  </main></>);
}

// 校徽位置按页面设计：锚在页面顶部随内容滚动（absolute），每页按页头版式给不同的位置与大小；
// 聊天对话页不放，保持对话界面干净。返回 null 表示该页不显示。
function emblemSpot(path: string): { top: number; right: number; width: number; opacity: number } | null {
  if (path.startsWith('/chat') || path.startsWith('/particle-flower')) return null;
  if (path.startsWith('/love-wall')) return { top: 54, right: 12, width: 118, opacity: 0.32 };
  if (path.startsWith('/songs')) return { top: 58, right: 12, width: 98, opacity: 0.32 };
  if (path.startsWith('/explore')) return { top: 96, right: 16, width: 106, opacity: 0.30 };
  if (path.startsWith('/home')) return { top: 62, right: 14, width: 104, opacity: 0.30 };
  if (path.startsWith('/me/notifications')) return { top: 56, right: 12, width: 76, opacity: 0.28 };
  if (path.startsWith('/me')) return { top: 68, right: 14, width: 82, opacity: 0.34 };
  if (path.startsWith('/friends')) return { top: 54, right: 12, width: 72, opacity: 0.26 };
  if (path.startsWith('/members')) return { top: 54, right: 12, width: 80, opacity: 0.30 };
  if (path.startsWith('/board')) return { top: 54, right: 12, width: 84, opacity: 0.30 };
  return { top: 58, right: 12, width: 88, opacity: 0.30 };
}

function Shell() {
  const { session, loading, guest, enterGuest, leaveGuest } = useAuth();
  const quietHoursActive = useQuietHoursActive(session?.user.id);  const [role, setRole] = useState('');
  const loc = useLocation();
  const emblem = emblemSpot(loc.pathname);
  const systemReduce = useReducedMotion();
  const [motionPreference, setMotionPreference] = useState<'system' | 'reduce' | 'full'>(() => {
    try { return (localStorage.getItem('qznb_motion_preference_v1') as 'system' | 'reduce' | 'full') || 'system'; } catch { return 'system'; }
  });
  const reduce = motionPreference === 'reduce' || !!systemReduce;
  useEffect(() => {
    const syncMotion = () => {
      try { setMotionPreference((localStorage.getItem('qznb_motion_preference_v1') as 'system' | 'reduce' | 'full') || 'system'); } catch { setMotionPreference('system'); }
    };
    window.addEventListener('qznb-settings-changed', syncMotion);
    return () => window.removeEventListener('qznb-settings-changed', syncMotion);
  }, []);
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isAdminPage = loc.pathname === '/admin';
  const isChatPage = loc.pathname.startsWith('/chat/');
  const isBloomPage = loc.pathname === '/particle-flower';
  const isAirInkPage = loc.pathname === '/air-ink';
  const isImmersivePage = isBloomPage || isAirInkPage;
  const nav = useNavigate();
  const [dockCollapsed, setDockCollapsed] = useState(() => {
    try { return localStorage.getItem('ca_dock_collapsed') === '1'; } catch { return false; }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [dockMoreOpen, setDockMoreOpen] = useState(false);
  const dockLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockLongPressTriggered = useRef(false);
  const dockLongPressOrigin = useRef<{ x: number; y: number } | null>(null);
  const clearDockLongPress = () => {
    if (dockLongPressTimer.current) {
      clearTimeout(dockLongPressTimer.current);
      dockLongPressTimer.current = null;
    }
    dockLongPressOrigin.current = null;
  };
  const startDockLongPress = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    clearDockLongPress();
    dockLongPressTriggered.current = false;
    dockLongPressOrigin.current = { x: event.clientX, y: event.clientY };
    dockLongPressTimer.current = window.setTimeout(() => {
      dockLongPressTriggered.current = true;
      dockLongPressOrigin.current = null;
      setDockMoreOpen(true);
    }, 520);
  };
  const moveDockLongPress = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = dockLongPressOrigin.current;
    if (!origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) {
      clearDockLongPress();
    }
  };
  const handleDockContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    clearDockLongPress();
    dockLongPressTriggered.current = true;
    setDockMoreOpen(true);
    window.setTimeout(() => { dockLongPressTriggered.current = false; }, 800);
  };
  const handleDockClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!dockLongPressTriggered.current) return;
    event.preventDefault();
    event.stopPropagation();
    dockLongPressTriggered.current = false;
  };
  useEffect(() => () => clearDockLongPress(), []);
  // 搜索入口已从 dock 移到首页：首页搜索条发这个事件打开全站搜索。
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener('qznb:open-search', open);
    return () => window.removeEventListener('qznb:open-search', open);
  }, []);
  const [dockSide, setDockSide] = useState<'left' | 'right'>(() => {
    try { return localStorage.getItem('ca_dock_side') === 'left' ? 'left' : 'right'; } catch { return 'right'; }
  });
  useEffect(() => {
    try {
      localStorage.setItem('ca_dock_collapsed', dockCollapsed ? '1' : '0');
      localStorage.setItem('ca_dock_side', dockSide);
    } catch { /* 偏好保存失败不影响导航 */ }
  }, [dockCollapsed, dockSide]);
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
    if (!session) { setNotifUnread(false); return; }
    let alive = true;
    const h = async () => {
      try {
        const { count, error } = await supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', session.user.id).eq('is_read', false);
        if (alive && !error) setNotifUnread((count ?? 0) > 0);
      } catch {
        // 请求失败时保留上次红点状态。
      }
    };
    const channel = supabase.channel('notification-badge-' + session.user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'profile_id=eq.' + session.user.id }, h)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'profile_id=eq.' + session.user.id }, h)
      .subscribe();
    window.addEventListener('notif-read', h);
    return () => {
      alive = false;
      window.removeEventListener('notif-read', h);
      void supabase.removeChannel(channel);
    };
  }, [session]);

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

  // 注册带邀请码：欢迎动画要在 App 层播（登录页验证通过会直接卸载，来不及播）
  const [welcome, setWelcome] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<{ realName: string; durationMs: number } | null>(null);
  const [gpsOffer, setGpsOffer] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsResult, setGpsResult] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [pwReset, setPwReset] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).has('code')
        || /[?&#]type=recovery/.test(window.location.search + window.location.hash);
    } catch { return false; }
  });
  // 登录后首次：欢迎动画。壁纸不再登录后自动弹，改由「我的」换壁纸手动打开
  const [showWp, setShowWp] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  function guideDone() {
    try { localStorage.setItem('qz_guide_seen_v1', '1'); } catch {}
    setShowGuide(false);
  }
  useEffect(() => {
    if (!session) return;
    let nick: string | null = null;
    try { nick = sessionStorage.getItem('ca_welcome_nick'); sessionStorage.removeItem('ca_welcome_nick'); } catch {}
    if (nick !== null) {
      setWelcome(nick);
      setLoginSuccess(null);
      return;
    }
    // 新注册引导：注册完成时 Login 写下 ca_guide_pending，本机没看过才展示（优先于登录成功弹窗）
    let guidePending = false;
    try {
      guidePending = sessionStorage.getItem('ca_guide_pending') === '1';
      sessionStorage.removeItem('ca_guide_pending');
    } catch {}
    if (guidePending) {
      let seen = false;
      try { seen = !!localStorage.getItem('qz_guide_seen_v1'); } catch {}
      if (!seen) {
        setShowGuide(true);
        setLoginSuccess(null);
        return;
      }
    }
    let shouldShowLoginSuccess = false;
    try {
      shouldShowLoginSuccess = sessionStorage.getItem('ca_login_success') === '1';
      sessionStorage.removeItem('ca_login_success');
    } catch {}
    if (shouldShowLoginSuccess) {
      // The start timestamp is written before the auth request begins. Read it
      // here, after the session arrives, so AuthProvider timing cannot race a
      // post-login write from the Login component.
      let durationMs = 0;
      try {
        const startedAt = Number(sessionStorage.getItem('ca_login_started_at') || 0);
        sessionStorage.removeItem('ca_login_started_at');
        // Remove the previous implementation's value in case an older tab left it behind.
        sessionStorage.removeItem('ca_login_elapsed_ms');
        if (Number.isFinite(startedAt) && startedAt > 0) {
          durationMs = Math.max(0, Date.now() - startedAt);
        }
      } catch {}
      const metadata = session.user.user_metadata as Record<string, unknown> | undefined;
      const realName = typeof metadata?.real_name === 'string' ? metadata.real_name.trim() : '';
      setLoginSuccess({ realName, durationMs });
    } else {
      // Do not let an abandoned/failed attempt affect a later session.
      try {
        sessionStorage.removeItem('ca_login_started_at');
        sessionStorage.removeItem('ca_login_elapsed_ms');
      } catch {}
    }
    // 新注册后的 GPS 说明仅在用户主动选择时继续，不在登录时自动请求位置。
    try {
      if (sessionStorage.getItem('ca_gps_offer') === '1') {
        sessionStorage.removeItem('ca_gps_offer');
        setGpsOffer(true);
      }
    } catch {}
  }, [session]);
  useEffect(() => {
    const open = () => setShowWp(true);
    window.addEventListener('ca:wallpaper:open', open);
    return () => window.removeEventListener('ca:wallpaper:open', open);
  }, []);
  function welcomeDone() {
    setWelcome(null);
    try {
      if (sessionStorage.getItem('ca_gps_offer') === '1') {
        sessionStorage.removeItem('ca_gps_offer');
        setGpsOffer(true);
      }
    } catch {}
  }


  useEffect(() => {
    if (session) supabase.rpc('my_role').then(({ data }) => setRole(data ?? ''), () => setRole(''));
    else setRole('');
  }, [session]);

  // 公共站点配置由受限 RPC 返回：只暴露访客首页所需字段，不开放成员表读取。
  const [siteConfig, setSiteConfig] = useState<any>(null);
  const [siteConfigLoading, setSiteConfigLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [guestEntryOpen, setGuestEntryOpen] = useState(false);
  const [maintenanceAccess, setMaintenanceAccess] = useState(false);

  // 临时通行权保存在当前标签页，并由服务端每 5 秒复核；撤销后会自动退回维护页。
  useEffect(() => {
    if (siteConfig?.maintenance !== 'true') { setMaintenanceAccess(false); return; }
    let alive = true;
    let checking = false;
    const validate = async () => {
      if (checking) return;
      checking = true;
      let token = '';
      try { token = sessionStorage.getItem('ca_maintenance_access') || ''; } catch {}
      if (!token) { if (alive) setMaintenanceAccess(false); checking = false; return; }
      try {
        const { data, error } = await supabase.rpc('maintenance_validate_access', { p_token: token });
        if (!alive) return;
        const valid = !error && data === true;
        setMaintenanceAccess(valid);
        if (!valid) { try { sessionStorage.removeItem('ca_maintenance_access'); } catch {} }
      } catch {
        if (alive) setMaintenanceAccess(false);
      } finally { checking = false; }
    };
    void validate();
    const timer = window.setInterval(() => { void validate(); }, 5 * 1000);
    const onFocus = () => { void validate(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [siteConfig?.maintenance, loc.pathname]);
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    setSiteConfigLoading(true);
    const refreshSiteConfig = async (initial = false) => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { data, error } = await supabase.rpc('public_guest_landing');
        if (alive && !error) setSiteConfig(data ?? null);
      } catch {
        // 保留上一次成功配置；短暂网络故障不应让维护页闪烁。
      } finally {
        inFlight = false;
        if (alive && initial) setSiteConfigLoading(false);
      }
    };
    void refreshSiteConfig(true);
    // 定时维护由数据库按当前时间计算；每 15 秒刷新，使已打开页面也能准时切换。
    const timer = window.setInterval(() => { void refreshSiteConfig(false); }, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [loc.pathname]);
  useEffect(() => { setShowLogin(false); }, [session]);

  // 管理员关闭游客模式、结束计划或清退会话版本变化时，当前游客会被撤销。
  useEffect(() => {
    if (!guest || siteConfigLoading || !siteConfig) return;
    const available = siteConfig.guest_browse_available === true;
    const currentEpoch = String(siteConfig.guest_session_epoch ?? '1');
    if (!available || guest.sessionEpoch !== currentEpoch) {
      leaveGuest();
      setShowLogin(false);
    }
  }, [guest, siteConfigLoading, siteConfig?.guest_browse_available, siteConfig?.guest_session_epoch]);

  // 每个已登录站点会话仅持有一个匿名 Presence 连接。
  useEffect(() => {
    if (!session?.user.id) return;
    return startSitePresence();
  }, [session?.user.id]);


  // 浏览器标签/阅读模式标题跟随后台「网站标题/副标题」设置（site_settings）：
  // 公共配置一到手就同步 document.title；index.html 里的静态标题只作首屏兜底。
  useEffect(() => {
    if (!siteConfig) return;
    const t = String(siteConfig.site_title || '我们的班级').trim() || '我们的班级';
    const s = String(siteConfig.site_subtitle || '青春档案').trim();
    document.title = s ? `${t} · ${s}` : t;
  }, [siteConfig]);

  // 在线心跳：仅在页面可见且近 5 分钟内有交互时续期；管理员只读取聚合人数。
  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    const device = parseDevice(navigator.userAgent || '');
    let alive = true;
    let lastActivity = Date.now();
    let inFlight = false;

    const markActivity = () => { lastActivity = Date.now(); };
    const heartbeat = async () => {
      if (!alive || inFlight || document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity > 5 * 60 * 1000) return;
      inFlight = true;
      try {
        await supabase.from('member_presence').upsert(
          { profile_id: uid, device: device || null, updated_at: new Date().toISOString() },
          { onConflict: 'profile_id' });
      } catch { /* 心跳失败不影响正常使用 */ }
      finally { inFlight = false; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        markActivity();
        void heartbeat();
      }
    };

    void heartbeat();
    const timer = window.setInterval(() => { void heartbeat(); }, 60 * 1000);
    window.addEventListener('pointerdown', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('touchstart', markActivity, { passive: true });
    window.addEventListener('scroll', markActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('touchstart', markActivity);
      window.removeEventListener('scroll', markActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session?.user.id]);

  function closeGpsOffer() {
    setGpsOffer(false);
    setGpsResult(null);
    setGpsError('');
    setGpsBusy(false);
  }

  async function logout() { await supabase.auth.signOut(); }

  if (loading) return <div className="center"><FxLoader text="加载中…" /></div>;
  if (!session && isAdminPage) return (<><div className="glow" /><div style={{ position: 'fixed', inset: 0, background: '#fff' }} /><div style={{ position: 'relative' }}><AdminLogin /></div></>);
  // 从重置密码邮件回来：优先显示设置新密码页。
  if (pwReset) return (<><div className="glow" /><ResetPassword onDone={() => {
    setPwReset(false);
    try { window.history.replaceState(null, '', window.location.pathname + window.location.hash); } catch {}
  }} /></>);
  if (!session && guest) {
    if (siteConfigLoading) return <div className="center" style={{ minHeight: '60vh' }}><FxLoader text="正在加载公开内容…" /></div>;
    if (siteConfig?.maintenance === 'true' && !maintenanceAccess) return <MaintenanceScreen title={siteConfig.maintenance_title || ''} msg={siteConfig.maintenance_msg || ''} hasSession={false} onLogout={() => { leaveGuest(); }} onAccessGranted={() => setMaintenanceAccess(true)} />;
    return <GuestBrowse
      nickname={guest.nickname}
      expiresAt={guest.expiresAt}
      siteConfig={siteConfig}
      loginOpen={showLogin}
      loginEnabled={siteConfig?.close_login_entry !== 'true'}
      onOpenLogin={() => setShowLogin(true)}
      onCloseLogin={() => setShowLogin(false)}
      showLoveWall={siteConfig?.guest_show_love_wall === true}
      showAnnouncements={siteConfig?.guest_show_announcements === true}
      onExit={() => { setShowLogin(false); leaveGuest(); }}
    />;
  }
  if (!session) {
    if (siteConfigLoading) return <div className="center" style={{ minHeight: '60vh' }}><FxLoader text="正在加载公开内容…" /></div>;
    if (siteConfig?.maintenance === 'true' && !maintenanceAccess) return <MaintenanceScreen title={siteConfig.maintenance_title || ''} msg={siteConfig.maintenance_msg || ''} hasSession={false} onLogout={logout} onAccessGranted={() => setMaintenanceAccess(true)} />;
    const showGuestEntry = siteConfig?.guest_browse_available === true && siteConfig?.guest_entry_visible === true;
    const openGuestEntry = () => setGuestEntryOpen(true);
    const finishGuestEntry = (nickname: string) => {
      enterGuest(nickname, Number(siteConfig?.guest_session_minutes || 60), String(siteConfig?.guest_session_epoch || '1'));
      setGuestEntryOpen(false);
    };
    if (showLogin && siteConfig?.close_login_entry !== 'true') return <><div className="glow" /><Login siteTitle={siteConfig?.site_title} siteSubtitle={siteConfig?.site_subtitle} onGuestLogin={showGuestEntry ? openGuestEntry : undefined} /><button className="mini ghost" style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top) + 12px)', right: 14, zIndex: 900 }} onClick={() => setShowLogin(false)}>返回公开首页</button><GuestNicknameDialog open={guestEntryOpen} onClose={() => setGuestEntryOpen(false)} onConfirm={finishGuestEntry} /></>;
    if (siteConfig?.skip_login_screen === 'true') return <><PublicLanding data={siteConfig} onLogin={() => setShowLogin(true)} onGuestLogin={openGuestEntry} showGuestEntry={showGuestEntry} /><GuestNicknameDialog open={guestEntryOpen} onClose={() => setGuestEntryOpen(false)} onConfirm={finishGuestEntry} /></>;
    if (siteConfig?.close_login_entry === 'true') return <><LoginClosedScreen onGuestLogin={openGuestEntry} showGuestEntry={showGuestEntry} /><GuestNicknameDialog open={guestEntryOpen} onClose={() => setGuestEntryOpen(false)} onConfirm={finishGuestEntry} /></>;
    return <><div className="glow" /><Login siteTitle={siteConfig?.site_title} siteSubtitle={siteConfig?.site_subtitle} onGuestLogin={showGuestEntry ? openGuestEntry : undefined} /><GuestNicknameDialog open={guestEntryOpen} onClose={() => setGuestEntryOpen(false)} onConfirm={finishGuestEntry} /></>;
  }
  // 维护模式：后台开关开着时，主站所有人只显示维护页（管理后台页本身不受影响）。
  if (siteConfig?.maintenance === 'true' && !isAdminPage && !maintenanceAccess) {
    return <MaintenanceScreen title={siteConfig.maintenance_title || ''} msg={siteConfig.maintenance_msg || ''} hasSession={!!session} onLogout={logout} onAccessGranted={() => setMaintenanceAccess(true)} />;
  }

  // Build the four Dock items without a Hook here. This code is below
  // several intentional early returns (loading, login, maintenance), so using
  // useMemo here would change the Hook order between renders and crash App.
  const dockItems = TABS.map((tab) => ({
    id: tab.to,
    label: tab.label,
    icon: (
      <DockIcon
        kind={tab.to === '/home' ? 'home' : tab.to === '/explore' ? 'explore' : tab.to === '/friends' ? 'friends' : 'me'}
        unread={tab.to === '/home' && boardUnread}
      />
    ),
  }));
  const activeDockItem = TABS.find((tab) => isTabActive(tab.to, loc.pathname))?.to ?? TABS[0].to;

  return (
    <LiquidGlassScene className="qz-ios26-scene">
      <>
      <div className="glow" />
      <div className="app-bg qz-ios26-backdrop" style={wp.kind === 'grad'
        ? { background: wp.src, filter: `blur(${wp.blur}px) brightness(${100 - wp.dark}%)` }
        : { backgroundImage: `url(${wp.src === 'default' ? bgUrl : wp.src})`, filter: `blur(${wp.blur}px) brightness(${100 - wp.dark}%)` }} />
      {emblem && <img src={emblemUrl} alt="" aria-hidden draggable={false}
        style={{ position: 'absolute', top: emblem.top, right: emblem.right, width: emblem.width, opacity: emblem.opacity, pointerEvents: 'none', userSelect: 'none', zIndex: 30 }} />}
      {isAdminPage ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e8eaf0' }}>
          <b style={{ fontSize: 15 }}>管理后台</b>
          <span style={{ flex: 1 }} />
          <NavLink to="/members" style={{ fontSize: 13, color: '#303642', textDecoration: 'none' }}>← 回站点</NavLink>
          <button className="mini ghost" onClick={logout}>退出</button>
        </div>
      ) : !isChatPage && !isImmersivePage ? (
      <LiquidGlass
        className="qz-ios26-topnav-glass"
        renderer="webgl"
        autodetectquality
        maxScale={1.35}
        reveal="immediate"
        radius={28}
        blur={9}
        dispersion={30}
        aberrationIntensity={0.16}
        saturation={158}
        glassColor="rgba(255,255,255,0.34)"
        style={{
          position: 'sticky',
          top: 'calc(env(safe-area-inset-top) + 10px)',
          zIndex: 50,
          width: 'min(1280px, calc(100% - 32px))',
          margin: 'calc(env(safe-area-inset-top) + 10px) auto 18px',
          display: 'block',
        }}
      >
      <nav className="topnav">
        <span className="links">
          {TABS.map(t => (
            <NavLink key={t.to} to={t.to} className={isTabActive(t.to, loc.pathname) ? 'on' : ''}>{t.label}</NavLink>
          ))}
          {isAdmin && <NavLink to="/admin" className={loc.pathname === '/admin' ? 'on' : ''}>管理后台</NavLink>}
        </span>
        <span className="sp" />
        {isAdmin && <a href="#/admin" title="管理后台" className="mob-admin" style={{ textDecoration: 'none', marginRight: 4, fontSize: 13 }}>管理</a>}
        <button type="button" onClick={() => setSearchOpen(true)} title="搜索全站内容">⌕ 搜索</button>
        <button onClick={logout} title="退出登录">退出</button>
      </nav></LiquidGlass>
      ) : null}

      <div className={isChatPage ? "wrap chat-shell" : loc.pathname === '/friends' ? "wrap inbox-shell" : "wrap"}>
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname}
            className={isImmersivePage ? "qz-route-transition qz-route-transition--fullscreen" : "qz-route-transition"}
            initial={reduce ? false : isImmersivePage ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.992 }}
            animate={isImmersivePage ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 1 } : isImmersivePage ? { opacity: 0 } : { opacity: 0, y: -7, scale: 0.996 }}
            transition={{ duration: reduce ? 0 : DUR.base + 0.06, ease: EASE }}>
            <Routes location={loc}>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/board" element={<Board />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/particle-flower" element={<ErrorBoundary><ParticleFlower /></ErrorBoundary>} />
              <Route path="/air-ink" element={<ErrorBoundary><AirInk /></ErrorBoundary>} />
              <Route path="/love-wall" element={<LoveWall />} />
              <Route path="/songs" element={<SongWall />} />
              <Route path="/daily" element={<Daily searchQuery={typeof (loc.state as any)?.searchQuery === 'string' ? (loc.state as any).searchQuery : ''} />} />
              <Route path="/members" element={<Members />} />
              <Route path="/members/:id" element={<Member />} />
              <Route path="/feed" element={<Discover />} />
              <Route path="/albums" element={<Navigate to="/feed" replace state={{ openTab: "albums" }} />} />
              <Route path="/albums/:id" element={<AlbumDetail />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/messages" element={<Navigate to="/friends" replace />} />
              <Route path="/chat/:cid" element={<Chat />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/timeline/:uid" element={<Timeline />} />
              <Route path="/me" element={<MeHub />} />
              <Route path="/me/content" element={<MeContent />} />
              <Route path="/me/edit" element={<div className="me-compact"><MyProfile /></div>} />
              <Route path="/me/posts" element={<MePosts />} />
              <Route path="/me/favorites" element={<MeFavorites />} />
              <Route path="/me/greetings" element={<MeGreetings />} />
              <Route path="/me/notifications" element={<MeNotifications />} />
              <Route path="/me/feedback" element={<MeFeedback />} />
              <Route path="/me/account" element={<MeAccount />} />
              <Route path="/me/settings" element={<MeSettings />} />
              <Route path="/me/settings/passkey" element={<MePasskey />} />
              <Route path="/me/settings/privacy" element={<MePrivacy />} />
              <Route path="/me/settings/devices" element={<MeDevices />} />
              <Route path="/me/settings/general" element={<MeGeneral />} />
              <Route path="/me/settings/notifications" element={<MeNotifySettings />} />
              <Route path="/me/growth" element={<MeGrowth />} />
              <Route path="/greetings" element={<Greetings />} />
              <Route path="/home" element={<Home />} />
                            <Route path="/capsule" element={<Capsule />} />
              <Route path="/calendar" element={<MemoryCalendar />} />
              <Route path="/wishes" element={<Wishes />} />
              <Route path="/events" element={<Events />} />
              <Route path="/hot" element={<HotSnippets />} />
              <Route path="/admin" element={<ErrorBoundary><AdminRoute /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {!isAdminPage && !isChatPage && !isBloomPage && (
        <div
          className={`qz-ios26-dock-host dock-side-${dockSide}`}
          onPointerDown={startDockLongPress}
          onPointerMove={moveDockLongPress}
          onPointerUp={clearDockLongPress}
          onPointerLeave={clearDockLongPress}
          onPointerCancel={clearDockLongPress}
          onContextMenu={handleDockContextMenu}
          onClickCapture={handleDockClickCapture}
        >
          {dockCollapsed ? (
            <button
              type="button"
              className={`qz-ios26-dock-collapsed dock-side-${dockSide}`}
              aria-label="展开 Dock"
              title="展开 Dock"
              onClick={() => setDockCollapsed(false)}
            >＋</button>
          ) : (
            <RdevLiquidGlass
              className="qz-rdev-dock"
              displacementScale={55}
              blurAmount={0.1}
              saturation={150}
              aberrationIntensity={2}
              elasticity={reduce ? 0 : 0.25}
              cornerRadius={30}
              padding="0px"
              style={{
                position: 'fixed',
                left: '50%',
                top: 'calc(100dvh - 40px - env(safe-area-inset-bottom))',
                width: 'min(360px, calc(100vw - 24px))',
                height: '56px',
                zIndex: 50,
              }}
            >
            <LiquidGlassNav
              className="qz-ios26-liquid-dock qz-rdev-nav"
              items={dockItems}
              activeItem={activeDockItem}
              onItemChange={(id) => {
                if (dockLongPressTriggered.current) return;
                const target = TABS.find((tab) => tab.to === id);
                if (target && !isTabActive(target.to, loc.pathname)) nav(target.to);
              }}
              activeColor="#263b4f"
              inactiveColor="rgba(58, 78, 96, 0.78)"
              reducedMotion={reduce}
              style={{
                position: 'relative',
                left: 'auto',
                right: 'auto',
                bottom: 'auto',
                transform: 'none',
                zIndex: 'auto',
                width: '100%',
                height: '100%',
                padding: '0 7px',
                gap: '0px',
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
              }}
            />
            </RdevLiquidGlass>
          )}
        </div>
      )}
      <AnimatePresence>
        {dockMoreOpen && !isAdminPage && !isChatPage && !isBloomPage && (
          <>
            <motion.button
              type="button"
              className="qz-ios26-dock-more-backdrop"
              aria-label="关闭 Dock 快捷菜单"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDockMoreOpen(false)}
            />
            <LiquidGlass
              className="qz-ios26-dock-more-glass"
              renderer="webgl"
              autodetectquality
              maxScale={1.2}
              reveal="immediate"
              radius={28}
              blur={10}
              dispersion={30}
              aberrationIntensity={0.16}
              saturation={168}
              glassColor="rgba(255,255,255,0.38)"
              style={{
                position: 'fixed',
                left: '50%',
                bottom: 'calc(88px + env(safe-area-inset-bottom))',
                transform: 'translateX(-50%)',
                zIndex: 61,
                width: 'min(420px, calc(100vw - 28px))',
                // Let the quick panel size to its content instead of inheriting 100vh.
                height: 'auto',
                maxHeight: 'calc(100dvh - 120px)',
                display: 'block',
              }}
            >
              <motion.div
                className="qz-ios26-dock-more-panel"
                initial={{ opacity: 0, y: 14, scale: .96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: .98 }}
                transition={{ duration: reduce ? 0 : .22, ease: EASE }}
              >
                <div className="qz-ios26-dock-more-heading">
                  <span>快捷入口</span>
                  <span className="qz-ios26-dock-more-hint">长按 Dock 打开</span>
                </div>
                <div className="qz-ios26-dock-more-grid">
                  {DOCK_MORE_TABS.map((item) => (
                    <NavLink key={item.to} to={item.to}
                      className={({ isActive }) => `qz-ios26-dock-more-item ${isActive || isTabActive(item.to, loc.pathname) ? 'on' : ''}`}
                      onClick={() => setDockMoreOpen(false)}>
                      <span>{item.label}</span>
                      {item.to === '/me/notifications' && notifUnread && !quietHoursActive && <i className="qz-ios26-dock-more-unread" />}
                    </NavLink>
                  ))}
                </div>
                <div className="qz-ios26-dock-more-actions">
                  <button type="button" onClick={() => { setDockCollapsed(value => !value); setDockMoreOpen(false); }}>
                    {dockCollapsed ? '展开 Dock' : '收起 Dock'}
                  </button>
                  <button type="button" onClick={() => { setDockSide(side => side === 'left' ? 'right' : 'left'); setDockMoreOpen(false); }}>
                    切换停靠位置
                  </button>
                  <button type="button" onClick={() => setDockMoreOpen(false)}>关闭</button>
                </div>
              </motion.div>
            </LiquidGlass>
          </>
        )}
      </AnimatePresence>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      {gpsOffer && !isAdminPage && (
        <div role="dialog" aria-modal="true" aria-labelledby="gps-consent-title" onClick={closeGpsOffer} style={{
          position: 'fixed', inset: 0, zIndex: 700,
          background: 'radial-gradient(ellipse at 16% 12%, rgba(52,166,162,.18), transparent 44%), rgba(239,247,248,.56)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        }}>
          <section onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto',
            padding: 'clamp(20px,4vw,26px)', borderRadius: 26, color: '#203b4b',
            background: 'rgba(255,255,255,.96)',
            border: '1px solid rgba(204,224,227,.92)',
            boxShadow: '0 24px 76px rgba(20,65,76,.20)',
            backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              marginBottom: 10, padding: '5px 10px', borderRadius: 999,
              background: '#eaf5f5', color: '#176477',
              fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
            }}>
              <span aria-hidden>⌖</span> LOCATION · OPTIONAL
            </div>
            <h2 id="gps-consent-title" style={{ margin: '0 0 10px', fontSize: 22, letterSpacing: '-.3px', color: '#203b4b' }}>
              开启设备定位（自愿）
            </h2>
            <p style={{ margin: '0 0 14px', lineHeight: 1.75, color: '#607985', fontSize: 14 }}>
              如果你想确认当前手机或浏览器能否正常定位，可以开启一次定位，在本页查看设备返回的位置和精度，帮助你检查设备定位设置是否正常。
            </p>
            <div style={{
              padding: '14px 15px', borderRadius: 17,
              background: 'linear-gradient(145deg,#f5fafb,#edf6f6)',
              border: '1px solid #e0eeee',
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#285b68', marginBottom: 8 }}>你可以放心选择</div>
              <ul style={{ margin: 0, paddingLeft: 19, lineHeight: 1.75, color: '#607985', fontSize: 13 }}>
                <li>定位结果只在当前页面临时显示，不上传服务器、不写入账号或数据库，管理员和其他成员都看不到。</li>
                <li>只有点击下方按钮后，网站才会向浏览器发起定位请求；浏览器会按当前站点权限状态处理，是否允许由你决定。</li>
                <li>这不是签到、考勤或位置共享功能；拒绝授权也不会影响注册、登录和网站基本使用。</li>
                <li>关闭此窗口会清除本页临时坐标；已授予的浏览器权限也可随时在设备或浏览器设置中撤回。</li>
              </ul>
            </div>
            {gpsError && (
              <p role="alert" style={{
                margin: '12px 0 0', padding: '10px 12px', borderRadius: 12,
                color: '#a33f48', background: '#fff2f2', border: '1px solid #f3d7da', lineHeight: 1.6,
              }}>{gpsError}</p>
            )}
            {gpsResult && (
              <div style={{
                marginTop: 12, padding: 13, borderRadius: 14,
                background: '#f7fbfb', border: '1px solid #dcebed',
                color: '#456773', lineHeight: 1.8, overflowWrap: 'anywhere', fontSize: 13,
              }}>
                <b style={{ color: '#176477' }}>本页临时定位结果</b><br />
                纬度：{gpsResult.latitude.toFixed(6)}<br />
                经度：{gpsResult.longitude.toFixed(6)}<br />
                设备报告精度：约 {Math.round(gpsResult.accuracy)} 米<br />
                <small style={{ color: '#82959d' }}>仅供你在当前页面核对；关闭窗口后清除。</small>
              </div>
            )}
            <button className="pri" disabled={gpsBusy || !!gpsResult} onClick={() => {
              setGpsError('');
              if (!navigator.geolocation) {
                setGpsError('当前浏览器不支持定位。你可以跳过，不影响使用网站。');
                return;
              }
              setGpsBusy(true);
              navigator.geolocation.getCurrentPosition(
                position => {
                  setGpsResult({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                  });
                  setGpsBusy(false);
                },
                error => {
                  setGpsError(error.code === error.PERMISSION_DENIED
                    ? '你拒绝了浏览器的位置权限。网站不会继续尝试定位，你可以直接跳过。'
                    : error.code === error.TIMEOUT
                      ? '定位超时，请检查设备定位设置后自愿重试，或直接跳过。'
                      : '暂时无法获取位置。你可以检查浏览器权限，或直接跳过。');
                  setGpsBusy(false);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
              );
            }} style={{
              width: '100%', marginTop: 14, padding: 13, borderRadius: 14,
              background: 'linear-gradient(135deg,#176477,#2c9999)', color: '#fff',
              boxShadow: '0 8px 22px rgba(22,100,117,.18)',
            }}>
              {gpsBusy ? '正在请求设备位置…' : gpsResult ? '已完成本页位置检查' : '继续，打开浏览器定位授权'}
            </button>
            <button className="ghost" disabled={gpsBusy} onClick={closeGpsOffer} style={{
              width: '100%', marginTop: 8, padding: 12, borderRadius: 14,
              border: '1px solid #dce8eb', background: '#f5f9fa', color: '#56717d',
            }}>
              {gpsResult ? '关闭并清除本页坐标' : '暂不授权，直接进入网站'}
            </button>
            <p style={{ margin: '10px 0 0', textAlign: 'center', color: '#8a9ba2', fontSize: 11, lineHeight: 1.5 }}>
              完全自愿 · 不影响任何账号功能 · 不会替你自动同意系统权限
            </p>
          </section>
        </div>
      )}
      {showWp && <WallpaperOnboarding onDone={() => setShowWp(false)} />}
      {loginSuccess && <LoginSuccessOverlay realName={loginSuccess.realName} durationMs={loginSuccess.durationMs} onDone={() => setLoginSuccess(null)} />}
      {welcome !== null && <WelcomeOverlay nick={welcome} onDone={welcomeDone} />}
      {showGuide && (
        <motion.div role="dialog" aria-modal="true" aria-label="班级网站功能引导"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          style={{ position: 'fixed', inset: 0, zIndex: 500, overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 35%, #202b48 0%, #0a0d15 58%, #05060a 100%)' }}>
          <GuideCarousel onDone={guideDone} />
        </motion.div>
      )}
      {loginPop && (
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
      </>
    </LiquidGlassScene>
  );
}

// main.tsx 已提供 <HashRouter><AuthProvider>，这里只返回 Shell（重复嵌套路由会直接崩溃黑屏）。
export default function App() {
  return <Shell />;
}
