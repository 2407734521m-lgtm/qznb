import { useEffect, useRef, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DUR, EASE } from './lib/motion';
import { supabase } from './lib/supabase';
import { startSitePresence } from './lib/sitePresence';
import { useAuth } from './auth';
import { getWallpaper } from './lib/wallpaper';
import WallpaperOnboarding from './components/WallpaperOnboarding';
import BlurText from './components/fx/BlurText';
import ShinyText from './components/fx/ShinyText';
import FxLoader from './components/fx/Loader';
import WelcomeOverlay from './components/WelcomeOverlay';
import LoginSuccessOverlay from './components/LoginSuccessOverlay';
import bgUrl from './assets/bg.jpg';
import emblemUrl from './assets/pingzhong-emblem.png';
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
import MeFeedback from './pages/MeFeedback';
import MeAccount from './pages/MeAccount';
import ErrorBoundary from './components/ErrorBoundary';
import AdminLogin from './pages/AdminLogin';
import Board from './pages/Board';
import HotSnippets from './pages/HotSnippets';
import LoveWall from './pages/LoveWall';
import Explore from './pages/Explore';
import SongWall from './pages/SongWall';
import Daily from './pages/Daily';
import { alertDialog } from './lib/dialog';
import GlobalSearch from './components/GlobalSearch';

const TABS = [
  { to: '/board', label: '公告' },
  { to: '/members', label: '班级' },
  { to: '/explore', label: '发现' },
  { to: '/friends', label: '私聊' },
  { to: '/me/notifications', label: '消息' },
  { to: '/songs', label: '歌声墙' },
  { to: '/love-wall', label: '表白墙' },
  { to: '/daily', label: '日常' },
  { to: '/timeline', label: '回忆' },
  { to: '/me', label: '我的' },
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
  if (tab === '/board') return path.startsWith('/board');
  if (tab === '/members') return path.startsWith('/members');
  if (tab === '/explore') return ['/explore','/feed','/albums','/hot','/greetings','/events','/capsule','/wishes'].some(p => path.startsWith(p));
  if (tab === '/friends') return ['/friends','/chat'].some(p => path.startsWith(p));
  if (tab === '/songs') return path.startsWith('/songs');
  if (tab === '/love-wall') return path.startsWith('/love-wall');
  if (tab === '/daily') return path.startsWith('/daily');
  if (tab === '/timeline') return path.startsWith('/timeline');
  if (tab === '/me/notifications') return path.startsWith('/me/notifications');
  if (tab === '/me') return path.startsWith('/me') && !path.startsWith('/me/notifications');
  return path === tab;
}

// 测试账号快切：从管理后台一键切换登录后，各页面右下角悬浮"结束测试"一键切回
// （只有走过管理后台切换流程的人才看得到，普通用户没有）
function TestSwitchFab() {
  const { session } = useAuth();
  const [testingAs, setTestingAs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      // 兼容旧测试账号列表，但只保留备注名和邮箱；绝不继续迁移或保留明文密码。
      const stored = sessionStorage.getItem('ca_test_accounts') || localStorage.getItem('ca_test_accounts');
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        const safe = Array.isArray(parsed) ? parsed
          .filter((item): item is { id: string; label?: string; email: string } =>
            !!item && typeof item.id === 'string' && typeof item.email === 'string')
          .map(item => ({ id: item.id, label: typeof item.label === 'string' ? item.label : '', email: item.email.trim() }))
          : [];
        sessionStorage.setItem('ca_test_accounts', JSON.stringify(safe));
      }
      localStorage.removeItem('ca_test_accounts');
      setTestingAs(sessionStorage.getItem('ca_testing_as'));
    } catch { setTestingAs(null); }
  }, [session]);
  if (!session || !testingAs) return null;
  async function back() {
    if (busy) return;
    setBusy(true);
    try {
      sessionStorage.removeItem('ca_testing_as');
      sessionStorage.removeItem('ca_testing_from');
    } catch {}
    const { error } = await supabase.auth.signOut();
    if (error) alertDialog('退出测试账号失败，请重试。');
    else alertDialog('测试账号已退出。为保护账号安全，请重新登录原账号。');
    setBusy(false);
  }
  return (
    <button onClick={back} disabled={busy}
      style={{
        position: 'fixed', right: 14, bottom: 92, zIndex: 200, padding: '10px 15px', borderRadius: 999,
        border: '1px solid #ffffff2e', color: '#202124', fontSize: 13, fontWeight: 700, cursor: 'pointer',
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
  if (loading || (session && role === null)) return <div className="center" style={{ minHeight: '60vh' }}><FxLoader text="加载中…" /></div>;
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
      <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
        onChange={e => { setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
        onKeyDown={e => { if (e.key === 'Enter') void redeem(); }}
        placeholder="请输入六位数验证码" style={{ textAlign: 'center', letterSpacing: 8, fontSize: 22 }} />
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

function LoginClosedScreen() {
  const nav = useNavigate();
  return (<><div className="glow" /><div style={{ minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <section className="login-card" style={{ width: '100%', maxWidth: 430, textAlign: 'center' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: '#7a8494' }}>ACCESS NOTICE</div>
      <h1 style={{ fontSize: 23, margin: '12px 0' }}>登录入口暂未开放</h1>
      <p style={{ color: 'var(--mut)', lineHeight: 1.8, fontSize: 14 }}>管理员暂时关闭了登录与注册入口，请稍后再来。</p>
      <button className="mini ghost" style={{ marginTop: 12 }} onClick={() => nav('/admin')}>管理员入口</button>
    </section>
  </div></>);
}

function PublicLanding({ data, onLogin }: { data: any; onLogin: () => void }) {
  const nav = useNavigate();
  const notices = Array.isArray(data?.notices) ? data.notices : [];
  const title = data?.site_title || '我们的班级';
  const subtitle = data?.site_subtitle || '青春档案';
  const bannerText = data?.home_banner_text || '把我们的青春，留在这里';
  const bannerUrl = typeof data?.home_banner_url === 'string' && (data.home_banner_url.startsWith('https://') || data.home_banner_url.startsWith('http://')) ? data.home_banner_url : '';
  return (<><div className="glow" /><img src={emblemUrl} alt="" aria-hidden draggable={false}
      style={{ position: 'absolute', top: 68, right: 12, width: 88, opacity: 0.32, pointerEvents: 'none', userSelect: 'none', zIndex: 30 }} /><main style={{ width: 'min(100% - 28px, 820px)', margin: '0 auto', padding: '22px 0 48px', color: '#202632' }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 11, letterSpacing: 3, color: '#7b8492' }}>OUR CLASS · PUBLIC SPACE</div><h1 style={{ margin: '6px 0 0', fontSize: 24 }}>{title}</h1><p style={{ margin: '4px 0 0', color: '#737b89', fontSize: 13 }}><ShinyText text={subtitle} /></p></div>
      {data?.close_login_entry !== 'true' && <button className="pri" style={{ width: 'auto', padding: '10px 16px', whiteSpace: 'nowrap' }} onClick={onLogin}>登录 / 注册</button>}
    </header>
    <section style={{ aspectRatio: '16 / 9', width: '100%', position: 'relative', overflow: 'hidden', borderRadius: 22, marginBottom: 18, background: bannerUrl ? '#e9edf3' : 'linear-gradient(135deg,#f5f7fa,#e4e9f1)', border: '1px solid #e5e8ee', boxShadow: '0 12px 34px #202a3d0c' }}>
      {bannerUrl && <img src={bannerUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, padding: 'clamp(18px,5vw,30px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: bannerUrl ? 'linear-gradient(90deg,#10182899,transparent)' : 'linear-gradient(120deg,#ffffff00,#dfe4ec55)' }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: bannerUrl ? '#fff' : '#737b89' }}>ANNOUNCEMENTS</div>
        <h2 style={{ margin: '8px 0 0', color: bannerUrl ? '#fff' : '#202632', fontSize: 'clamp(20px,5vw,30px)', lineHeight: 1.3 }}><BlurText key={bannerText} text={bannerText} /></h2>
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
      {data?.close_login_entry !== 'true' && <button className="mini ghost" onClick={onLogin}>进入账号</button>}
    </div>
  </main></>);
}

// 校徽位置按页面设计：锚在页面顶部随内容滚动（absolute），每页按页头版式给不同的位置与大小；
// 聊天对话页不放，保持对话界面干净。返回 null 表示该页不显示。
function emblemSpot(path: string): { top: number; right: number; width: number; opacity: number } | null {
  if (path.startsWith('/chat')) return null;
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
  const { session, loading } = useAuth();  const [role, setRole] = useState('');
  const loc = useLocation();
  const emblem = emblemSpot(loc.pathname);
  const reduce = useReducedMotion();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isAdminPage = loc.pathname === '/admin';
  const isChatPage = loc.pathname.startsWith('/chat/');
  const nav = useNavigate();
  const barRef = useRef<HTMLElement>(null);
  const [dockCollapsed, setDockCollapsed] = useState(() => {
    try { return localStorage.getItem('ca_dock_collapsed') === '1'; } catch { return false; }
  });
  const [searchOpen, setSearchOpen] = useState(false);
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
    let alive = true;
    const h = async () => {
      if (!session) { setNotifUnread(false); return; }
      try {
        const { count, error } = await supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', session.user.id).eq('is_read', false);
        if (alive && !error) setNotifUnread((count ?? 0) > 0);
      } catch {
        // 请求失败时保留上次红点状态。
      }
    };
    window.addEventListener('notif-read', h);
    return () => {
      alive = false;
      window.removeEventListener('notif-read', h);
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
  const [loginSuccess, setLoginSuccess] = useState(false);
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
  useEffect(() => {
    if (!session) return;
    let nick: string | null = null;
    try { nick = sessionStorage.getItem('ca_welcome_nick'); sessionStorage.removeItem('ca_welcome_nick'); } catch {}
    if (nick !== null) {
      setWelcome(nick);
      setLoginSuccess(false);
      return;
    }
    let shouldShowLoginSuccess = false;
    try {
      shouldShowLoginSuccess = sessionStorage.getItem('ca_login_success') === '1';
      sessionStorage.removeItem('ca_login_success');
    } catch {}
    if (shouldShowLoginSuccess) setLoginSuccess(true);
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
  if (!session) {
    if (siteConfigLoading) return <div className="center" style={{ minHeight: '60vh' }}><FxLoader text="正在加载公开内容…" /></div>;
    if (siteConfig?.maintenance === 'true' && !maintenanceAccess) return <MaintenanceScreen title={siteConfig.maintenance_title || ''} msg={siteConfig.maintenance_msg || ''} hasSession={false} onLogout={logout} onAccessGranted={() => setMaintenanceAccess(true)} />;
    if (showLogin && siteConfig?.close_login_entry !== 'true') return <><div className="glow" /><Login /><button className="mini ghost" style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top) + 12px)', right: 14, zIndex: 900 }} onClick={() => setShowLogin(false)}>返回公开首页</button></>;
    if (siteConfig?.skip_login_screen === 'true') return <PublicLanding data={siteConfig} onLogin={() => setShowLogin(true)} />;
    if (siteConfig?.close_login_entry === 'true') return <LoginClosedScreen />;
    return <><div className="glow" /><Login /></>;
  }
  // 维护模式：后台开关开着时，主站所有人只显示维护页（管理后台页本身不受影响）。
  if (siteConfig?.maintenance === 'true' && !isAdminPage && !maintenanceAccess) {
    return <MaintenanceScreen title={siteConfig.maintenance_title || ''} msg={siteConfig.maintenance_msg || ''} hasSession={!!session} onLogout={logout} onAccessGranted={() => setMaintenanceAccess(true)} />;
  }

  return (
    <>
      <div className="glow" />
      <div className="app-bg" style={wp.kind === 'grad'
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
      ) : !isChatPage ? (
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
      </nav>
      ) : null}

      <div className={isChatPage ? "wrap chat-shell" : "wrap"}>
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: reduce ? 0 : DUR.base, ease: EASE }}>
            <Routes location={loc}>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/board" element={<Board />} />
              <Route path="/explore" element={<Explore />} />
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
              <Route path="/me/edit" element={<div className="me-compact"><MyProfile /></div>} />
              <Route path="/me/posts" element={<MePosts />} />
              <Route path="/me/favorites" element={<MeFavorites />} />
              <Route path="/me/greetings" element={<MeGreetings />} />
              <Route path="/me/notifications" element={<MeNotifications />} />
              <Route path="/me/feedback" element={<MeFeedback />} />
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

      {!isAdminPage && !isChatPage && (
        <nav
          ref={barRef}
          className={`tabbar ${dockCollapsed ? 'dock-collapsed dock-side-' + dockSide : ''}`}
          style={{ touchAction: 'pan-x pan-y' }}
          aria-label="主导航"
        >
          <div className="dock-scroll">
          <AnimatePresence initial={false}>
            {!dockCollapsed && TABS.map((t, i) => {
              const activeIdx = TABS.findIndex(x => isTabActive(x.to, loc.pathname));
              const on = i === activeIdx;
              return (
                <motion.div key={t.to} className="dock-item"
                  initial={reduce ? false : { opacity: 0, scale: 0.8, x: dockSide === 'left' ? -18 : 18 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : {
                    opacity: 0, scale: 0.4, x: dockSide === 'left' ? -40 : 40,
                    transition: { duration: DUR.fast, ease: EASE, delay: dockSide === 'left' ? (TABS.length - 1 - i) * 0.02 : i * 0.02 }
                  }}
                  transition={{ duration: reduce ? 0 : DUR.fast, ease: EASE, delay: reduce ? 0 : (dockSide === 'left' ? i * 0.02 : (TABS.length - 1 - i) * 0.02) }}>
                  <NavLink to={t.to} className={on ? 'on' : ''}
                    ref={on ? (el: any) => { if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' }); } : undefined}>
                    <span className="dock-tab-label">{t.label}</span>
                    {((t.to === '/board' && boardUnread) || (t.to === '/me/notifications' && notifUnread)) && <span className="dock-unread-dot" />}
                  </NavLink>
                </motion.div>
              );
            })}
          </AnimatePresence>
          </div>
          {!dockCollapsed && (
            <button
              type="button"
              className="dock-action dock-search"
              aria-label="搜索全站内容"
              title="搜索全站内容"
              onClick={() => setSearchOpen(true)}
            >⌕</button>
          )}
          <button
            type="button"
            className="dock-action dock-toggle"
            aria-label={dockCollapsed ? "展开导航栏" : "收起导航栏"}
            title={dockCollapsed ? "展开导航栏（双击切换收起侧）" : "收起导航栏（双击切换收起侧）"}
            onClick={() => setDockCollapsed(value => !value)}
            onDoubleClick={() => setDockSide(side => side === 'left' ? 'right' : 'left')}
          >
            {dockCollapsed ? (dockSide === 'left' ? '›' : '‹') : (dockSide === 'left' ? '‹' : '›')}
          </button>
        </nav>
      )}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      {gpsOffer && !isAdminPage && (
        <div role="dialog" aria-modal="true" aria-labelledby="gps-consent-title" onClick={closeGpsOffer} style={{
          position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,.78)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
          <section onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto',
            padding: 24, borderRadius: 22, color: '#f4f6ff',
            background: 'linear-gradient(155deg,#1a2340,#0b1020)',
            border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 24px 80px #000b',
          }}>
            <h2 id="gps-consent-title" style={{ margin: '0 0 10px', fontSize: 22 }}>精准位置授权（自愿）</h2>
            <p style={{ lineHeight: 1.7, color: 'rgba(244,246,255,.82)' }}>
              精准定位不是注册或登录的必需条件。只有你点击“同意并开启定位”后，浏览器才会请求设备的位置权限；你也可以直接跳过，不影响使用班级网站。
            </p>
            <ul style={{ paddingLeft: 20, lineHeight: 1.7, color: 'rgba(244,246,255,.82)' }}>
              <li>定位由设备和浏览器提供，精度受 GPS、网络和设备环境影响。</li>
              <li>本阶段只在当前页面临时显示坐标与精度，不上传服务器、不写入数据库，也不提供给管理员查看。</li>
              <li>拒绝、关闭或浏览器不支持定位，都不会影响基本功能。</li>
            </ul>
            {gpsError && <p role="alert" style={{ color: '#ffb4b4', lineHeight: 1.6 }}>{gpsError}</p>}
            {gpsResult && (
              <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.07)', lineHeight: 1.7, overflowWrap: 'anywhere' }}>
                <b>本页临时定位结果</b><br />
                纬度：{gpsResult.latitude.toFixed(6)}<br />
                经度：{gpsResult.longitude.toFixed(6)}<br />
                设备报告精度：约 {Math.round(gpsResult.accuracy)} 米<br />
                <small>关闭此弹窗或离开页面后，不会保存到网站账户。</small>
              </div>
            )}
            <button className="pri" disabled={gpsBusy || !!gpsResult} onClick={() => {
              setGpsError('');
              if (!navigator.geolocation) {
                setGpsError('当前浏览器不支持定位。你可以跳过，不影响使用。');
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
            }} style={{ width: '100%', marginTop: 14 }}>
              {gpsBusy ? '正在等待设备定位…' : gpsResult ? '已获取本页临时位置' : '同意并开启定位'}
            </button>
            <button className="ghost" disabled={gpsBusy} onClick={closeGpsOffer} style={{ width: '100%', marginTop: 8 }}>
              {gpsResult ? '关闭并清除本页坐标' : '暂不授权，继续使用网站'}
            </button>
          </section>
        </div>
      )}
      {showWp && <WallpaperOnboarding onDone={() => setShowWp(false)} />}
      {loginSuccess && <LoginSuccessOverlay onDone={() => setLoginSuccess(false)} />}
      {welcome !== null && <WelcomeOverlay nick={welcome} onDone={welcomeDone} />}
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
      <TestSwitchFab />
    </>
  );
}

// main.tsx 已提供 <HashRouter><AuthProvider>，这里只返回 Shell（重复嵌套路由会直接崩溃黑屏）。
export default function App() {
  return <Shell />;
}
