import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { startSitePresence } from '../lib/sitePresence';
import { useAuth } from '../auth';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import '../styles-admin-cinematic.css';
import '../styles-admin-unified.css';
import '../styles-admin-scaffold.css';
import '../styles-admin-ops.css';
import '../styles-admin-tokens.css';
import '../styles-admin-pages.css';
import '../styles-admin-contrast.css';
import AdminWorkspace from '../components/AdminWorkspace';
import AdminGuestAccess from '../components/AdminGuestAccess';
import AdminSystemCenter from '../components/AdminSystemCenter';
import AdminAnalyticsCenter from '../components/AdminAnalyticsCenter';
import AdminBackupCenter from '../components/AdminBackupCenter';
import AdminReleaseCenter from '../components/AdminReleaseCenter';
import AdminSecurityCenter from '../components/AdminSecurityCenter';
import AdminApprovalCenter from '../components/AdminApprovalCenter';
import AdminLoveWall from '../components/AdminLoveWall';
import AdminReviewCenter from '../components/AdminReviewCenter';
import AdminAppCenter from '../components/AdminAppCenter';
import AdminNotificationCenter from '../components/AdminNotificationCenter';
import AdminAuthorizedRequests from '../components/AdminAuthorizedRequests';
import AdminSongWall from '../components/AdminSongWall';
import AdminBulkEmail from '../components/AdminBulkEmail';
import AdminAccountManagement from '../components/AdminAccountManagement';
import Logs from './admin/Logs';
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
 * Dedicated admin console. The host route verifies the role once before mounting this page.
 */

const TABS_ALL: [string, string, boolean][] = [
  ['overview', '总览', false],
  ['analytics', '数据分析', true],
  ['backups', '备份与恢复', true],
  ['release', '版本发布', true],
  ['appCenter', '应用管理', false],
  ['accounts', '账号管理', true],
  ['invite', '邀请码', false],
  ['moderate', '审核', false],
  ['reviewCenter', '审核中心', false],
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
  ['guestAccess', '游客管理', false],
  ['settings', '设置', true], // 仅超管
  ['test', '测试', true], // 仅超管
];


export default function Admin({ verifiedRole }: { verifiedRole: 'admin' | 'super_admin' }) {
  const { session } = useAuth();
  const reduceMotion = useReducedMotion();
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
  const [tab, setTab] = useState('overview');
  const [msg, setMsg] = useState('');
  const [q0, setQ0] = useState('');
  const isSuper = verifiedRole === 'super_admin';
  const tabs = TABS_ALL.filter(([, , sup]) => !sup || isSuper);


  function switchTab(id: string) {
    setTab(id); setMsg('');
    window.scrollTo({ top: 0 });
  }

  function signOut() {
    void supabase.auth.signOut({ scope: 'local' }).then(({ error }) => {
      if (error) {
        console.error('管理员退出当前设备失败：', error);
        return;
      }
      location.reload();
    }).catch(error => console.error('管理员退出当前设备失败：', error));
  }

  if (!session) {
    return <div className="center" style={{ minHeight: '60vh' }}>登录会话已失效，请返回管理员登录页重新登录。</div>;
  }
  return (
    <div className="admin-shell-v3">
      <AdminWorkspace
        tabs={tabs}
        activeTab={tab}
        onSelect={switchTab}
        onLogout={signOut}
        isSuper={isSuper}
        memberSearch={q0}
        onMemberSearchChange={setQ0}
        onMemberSearchSubmit={() => switchTab('accounts')}
      >
        {msg && <p className="priv-note admin-global-message" role="status">{msg}</p>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="admin-content"
            key={tab}
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
          {tab === 'overview' && <Overview setMsg={setMsg} go={switchTab} />}
          {tab === 'analytics' && isSuper && <AdminAnalyticsCenter setMsg={setMsg} />}
          {tab === 'backups' && isSuper && <AdminBackupCenter setMsg={setMsg} />}
          {tab === 'release' && isSuper && <AdminReleaseCenter />}
          {tab === 'appCenter' && <AdminAppCenter setMsg={setMsg} />}
          {tab === 'accounts' && isSuper && <AdminAccountManagement me={me} isSuper={isSuper} setMsg={setMsg} extQ={q0} />}
          {tab === 'moderate' && <Moderate setMsg={setMsg} />}
          {tab === 'reviewCenter' && <AdminReviewCenter me={me} isSuper={isSuper} setMsg={setMsg} go={switchTab} />}
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
          {tab === 'guestAccess' && <AdminGuestAccess setMsg={setMsg} />}
          {tab === 'settings' && isSuper && <Settings me={me} setMsg={setMsg} />}
          {tab === 'invite' && <InviteTab isSuper={isSuper} setMsg={setMsg} />}
          {tab === 'feedback' && <FeedbackTab me={me} isSuper={isSuper} setMsg={setMsg} />}
          {tab === 'game' && <GameTab setMsg={setMsg} />}
          {tab === 'test' && isSuper && <TestTab setMsg={setMsg} />}
          </motion.div>
        </AnimatePresence>
      </AdminWorkspace>
    </div>
  );
}
