import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { startSitePresence } from '../lib/sitePresence';
import { useAuth } from '../auth';
import '../styles-admin-cinematic.css';
import '../styles-admin-unified.css';
import AdminSystemCenter from '../components/AdminSystemCenter';
import AdminAnalyticsCenter from '../components/AdminAnalyticsCenter';
import AdminBackupCenter from '../components/AdminBackupCenter';
import AdminReleaseCenter from '../components/AdminReleaseCenter';
import AdminSecurityCenter from '../components/AdminSecurityCenter';
import AdminApprovalCenter from '../components/AdminApprovalCenter';
import AdminLoveWall from '../components/AdminLoveWall';
import AdminNotificationCenter from '../components/AdminNotificationCenter';
import AdminAuthorizedRequests from '../components/AdminAuthorizedRequests';
import AdminSongWall from '../components/AdminSongWall';
import AdminBulkEmail from '../components/AdminBulkEmail';
import AdminAccountManagement from '../components/AdminAccountManagement';
import Logs from './admin/Logs';
import MaintenanceAccessManager from './admin/MaintenanceAccessManager';
import InviteTab from './admin/InviteTab';
import FeedbackTab from './admin/FeedbackTab';
import GameTab from './admin/GameTab';
import TestTab from './admin/TestTab';
import EventTab from './admin/EventTab';
import Moderate from './admin/Moderate';
import Settings from './admin/Settings';
import Overview from './admin/Overview';
import BoardMgr from './admin/BoardMgr';

/**
 * 管理后台测试版（V2）：高级管理控制中心
 * 通过 #/admin-v2 进入，不影响现有 /admin
 * 设计：深色玻璃拟态，文字按钮无 emoji，手机优先
 */

const TABS_ALL: [string, string, boolean][] = [
  ['overview', '总览', false],
  ['analytics', '数据分析', true],
  ['backups', '备份与恢复', true],
  ['release', '版本发布', true],
  ['accounts', '账号管理', true],
  ['invite', '邀请码', false],
  ['moderate', '审核', false],
  ['loveWall', '表白墙', false],
  ['notifications', '通知中心', false],
  ['authorizedRequests', '开盒队列', false],
  ['songWall', '歌声墙', false],
  ['bulkEmail', '批量邮件', false],
  ['feedback', '反馈', false],
  ['game', '段位', false],
  ['board', '公告', false],
  ['events', '活动', false],
  ['logs', '日志', false],
  ['security', '安全防护', true],
  ['approvals', '审批中心', true],
  ['system', '安全与监控', true],
  ['settings', '设置', true], // 仅超管
  ['test', '测试', true], // 仅超管
];


export default function Admin() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const isDedicatedAdminHost = window.location.hostname.split('.')[0].toLowerCase() === 'admin';

  // 独立 admin 子域名不会加载主站 App，因此在此补充管理员后台的在线心跳。
  // 与总览监听器共享同一 Presence channel，避免管理员自身重复计数。
  useEffect(() => {
    if (!isDedicatedAdminHost || !session?.user.id) return;
    return startSitePresence();
  }, [isDedicatedAdminHost, session?.user.id]);


  useEffect(() => {
    if (!isDedicatedAdminHost || !session) return;
    const uid = session.user.id;
    const device = /Android/.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iOS' : 'Desktop';
    let alive = true;
    let lastActivity = Date.now();
    let inFlight = false;
    const markActivity = () => { lastActivity = Date.now(); };
    const heartbeat = async () => {
      if (!alive || inFlight || document.visibilityState !== 'visible' || Date.now() - lastActivity > 5 * 60 * 1000) return;
      inFlight = true;
      try {
        await supabase.from('member_presence').upsert(
          { profile_id: uid, device, updated_at: new Date().toISOString() },
          { onConflict: 'profile_id' }
        );
      } catch { /* 在线统计失败不影响后台操作 */ }
      finally { inFlight = false; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { markActivity(); void heartbeat(); }
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
  }, [isDedicatedAdminHost, session?.user.id]);
  const [role, setRole] = useState('');
  const [verifiedUid, setVerifiedUid] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [msg, setMsg] = useState('');
  const [q0, setQ0] = useState('');
  const isSuper = role === 'super_admin';
  const tabs = TABS_ALL.filter(([, , sup]) => !sup || isSuper);

  useEffect(() => {
    let active = true;
    setVerifiedUid(null);
    setRole('');
    if (!session) {
      setRole('unauthorized');
      return () => { active = false; };
    }
    const uid = session.user.id;
    Promise.resolve(supabase.rpc('my_role')).then(({ data, error }) => {
      if (!active) return;
      setRole(!error && (data === 'admin' || data === 'super_admin') ? data : 'unauthorized');
      setVerifiedUid(uid);
    }).catch(() => {
      if (active) {
        setRole('unauthorized');
        setVerifiedUid(uid);
      }
    });
    return () => { active = false; };
  }, [session?.user.id]);

  const dockRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    dockRef.current?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [tab]);

  function switchTab(id: string) {
    setTab(id); setMsg('');
    window.scrollTo({ top: 0 });
  }

  function signOut() {
    void supabase.auth.signOut().then(() => location.reload());
  }

  if (!session) {
    return <div className="center" style={{ minHeight: '60vh' }}>登录会话已失效，请返回管理员登录页重新登录。</div>;
  }
  if (verifiedUid !== session.user.id || !role) {
    return <div className="center" style={{ minHeight: '60vh' }}>正在验证管理员权限…</div>;
  }
  if (role !== 'admin' && role !== 'super_admin') {
    return (
      <div className="center" style={{ minHeight: '60vh', padding: 24, textAlign: 'center' }}>
        <p>管理员权限验证失败，后台内容已锁定。</p>
        <button onClick={() => { void supabase.auth.signOut(); }}>退出登录</button>
      </div>
    );
  }

  return (
    <div className="page admin-shell" style={{
      background: '#0a0f1e', minHeight: '100vh',
      margin: '-14px calc(-14px - env(safe-area-inset-right)) 0 calc(-14px - env(safe-area-inset-left))',
      padding: '14px 14px 84px',
    }}>
      <div className="admin-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg,#5b8cff,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16, color: '#fff',
          }}>管</div>
          <div>
            <div className="admin-header-title" style={{ fontWeight: 800, fontSize: 17 }}>管理控制中心</div>
            <div style={{ fontSize: 11, color: '#8b93b0' }}>我们的班级 · 青春档案</div>
          </div>
        </div>
        <span style={{
          fontSize: 11, color: '#c9d4f5', background: '#5b8cff2e',
          padding: '3px 10px', borderRadius: 999, border: '1px solid #5b8cff55', whiteSpace: 'nowrap',
        }}>
          {isSuper ? '超级管理员' : '内容管理员'}
        </span>
      </div>

      {isSuper && (
        <form className="admin-search" onSubmit={e => { e.preventDefault(); switchTab('accounts'); }} style={{ marginBottom: 12 }}>
          <input value={q0} onChange={e => setQ0(e.target.value)} placeholder="搜索成员姓名 / 用户名 / 邮箱 / ID…"
            style={{
              width: '100%', boxSizing: 'border-box', background: '#ffffff0d',
              border: '1px solid #ffffff14', borderRadius: 10, padding: '9px 12px',
              color: '#fff', fontSize: 13, outline: 'none',
            }} />
        </form>
      )}

      {msg && <p className="priv-note" style={{ margin: '0 0 10px' }}>{msg}</p>}

      <div className="admin-content" key={tab} aria-live="polite">
        {tab === 'overview' && <Overview setMsg={setMsg} go={setTab} />}
        {tab === 'analytics' && isSuper && <AdminAnalyticsCenter setMsg={setMsg} />}
        {tab === 'backups' && isSuper && <AdminBackupCenter setMsg={setMsg} />}
        {tab === 'release' && isSuper && <AdminReleaseCenter />}
              {tab === 'accounts' && isSuper && <AdminAccountManagement me={me} isSuper={isSuper} setMsg={setMsg} extQ={q0} />}
              {tab === 'moderate' && <Moderate setMsg={setMsg} />}
              {tab === 'loveWall' && <AdminLoveWall setMsg={setMsg} />}
              {tab === 'notifications' && <AdminNotificationCenter setMsg={setMsg} />}
              {tab === 'authorizedRequests' && <AdminAuthorizedRequests setMsg={setMsg} />}
              {tab === 'songWall' && <AdminSongWall setMsg={setMsg} />}
              {tab === 'bulkEmail' && <AdminBulkEmail setMsg={setMsg} />}
              {tab === 'board' && <BoardMgr me={me} setMsg={setMsg} />}
              {tab === 'events' && <EventTab me={me} setMsg={setMsg} />}
              {tab === 'logs' && <Logs />}
              {tab === 'security' && isSuper && <AdminSecurityCenter session={session} setMsg={setMsg} />}
              {tab === 'approvals' && isSuper && <AdminApprovalCenter setMsg={setMsg} me={me} />}
              {tab === 'system' && isSuper && <AdminSystemCenter setMsg={setMsg} go={switchTab} />}
              {tab === 'settings' && isSuper && <Settings me={me} setMsg={setMsg} />}
              {tab === 'invite' && <InviteTab isSuper={isSuper} setMsg={setMsg} />}
              {tab === 'feedback' && <FeedbackTab me={me} isSuper={isSuper} setMsg={setMsg} />}
              {tab === 'game' && <GameTab setMsg={setMsg} />}
              {tab === 'test' && isSuper && <TestTab setMsg={setMsg} />}
      </div>

      {/* 手机端 Dock：全部功能一排横滑，不再分组收进「更多」 */}
      <nav className="admin-mobile-dock" aria-label="管理员主导航" ref={dockRef}>
        {tabs.map(([id, label]) => (
          <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => switchTab(id)}>
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className="admin-dock-exit" onClick={signOut}>
          <span>退出</span>
        </button>
      </nav>

      {/* 桌面端侧边 Dock */}
      <div className="admin-dock admin-dock-desktop" style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 60,
        bottom: 'calc(14px + env(safe-area-inset-bottom))',
        width: 'max-content', maxWidth: 'calc(100vw - 28px)',
        padding: 6, borderRadius: 999,
        background: 'color-mix(in srgb,#1a1e30 42%,transparent)',
        backdropFilter: 'blur(30px) saturate(1.8)', WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
        border: '1px solid #ffffff2e',
        boxShadow: '0 14px 44px #000c,inset 0 1px 0 #ffffff2b',
      }}>
        <div className="row" style={{ gap: 2, overflowX: 'auto', flexWrap: 'nowrap', maxWidth: '100%' }}>
          {tabs.map(([id, label]) => (
            <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => switchTab(id)} style={{
              flexShrink: 0, whiteSpace: 'nowrap', padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
              fontSize: 13, border: 0, fontFamily: 'inherit',
              background: tab === id ? 'linear-gradient(135deg,#5b8cff,#8b5cf6)' : 'none',
              color: tab === id ? '#fff' : 'var(--mut)',
              fontWeight: tab === id ? 700 : 400,
            }}>{label}</button>
          ))}
          <button onClick={signOut} style={{
            flexShrink: 0, whiteSpace: 'nowrap', padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
            fontSize: 13, border: 0, fontFamily: 'inherit', marginLeft: 4,
            background: 'rgba(255,107,107,.12)', color: '#ff9d9d',
          }}>退出</button>
        </div>
      </div>
    </div>
  );
}
