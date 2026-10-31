import { useEffect, useState } from 'react';
import AdminMemberModal from '../components/AdminMemberModal';
import { supabase, supabaseBaseUrl } from '../lib/supabase';
import { useAuth } from '../auth';
import '../styles-admin-cinematic.css';
import '../styles-admin-unified.css';
import AdminSystemCenter from '../components/AdminSystemCenter';
import AdminLoveWall from '../components/AdminLoveWall';
import AdminNotificationCenter from '../components/AdminNotificationCenter';
import AdminSongWall from '../components/AdminSongWall';
import AdminBulkEmail from '../components/AdminBulkEmail';
import AdminAccountManagement from '../components/AdminAccountManagement';
import type { AdminPost as Post, AdminComment as Cmt } from '../types/content';
import { Spark, TrendChart, Donut } from './admin/charts';
import { card, h3, mut, rowBtn, alog, timeAgo } from './admin/shared';
import Logs from './admin/Logs';
import MaintenanceAccessManager from './admin/MaintenanceAccessManager';
import InviteTab from './admin/InviteTab';
import FeedbackTab from './admin/FeedbackTab';
import GameTab from './admin/GameTab';
import TestTab from './admin/TestTab';
import EventTab from './admin/EventTab';
import Moderate from './admin/Moderate';
import Settings from './admin/Settings';

/**
 * 管理后台测试版（V2）：高级管理控制中心
 * 通过 #/admin-v2 进入，不影响现有 /admin
 * 设计：深色玻璃拟态，文字按钮无 emoji，手机优先
 */

type Member = {
  id: string; username: string; display_name: string | null; real_name: string | null;
  role: string; joined: boolean; created_at: string;
};

const TABS_ALL: [string, string, boolean][] = [
  ['overview', '总览', false],
  ['members', '成员', false],
  ['accounts', '账号管理', true],
  ['invite', '邀请码', false],
  ['moderate', '审核', false],
  ['loveWall', '表白墙', false],
  ['notifications', '通知中心', false],
  ['songWall', '歌声墙', false],
  ['bulkEmail', '批量邮件', false],
  ['feedback', '反馈', false],
  ['game', '段位', false],
  ['board', '公告', false],
  ['events', '活动', false],
  ['logs', '日志', false],
  ['system', '安全与监控', true],
  ['settings', '设置', true], // 仅超管
  ['test', '测试', true], // 仅超管
];


function bucket14(rows: { created_at: string }[]) {
  const days: number[] = Array(14).fill(0);
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 13);
  rows.forEach(r => {
    const d = new Date(r.created_at); d.setHours(0, 0, 0, 0);
    const i = Math.round((d.getTime() - start.getTime()) / 864e5);
    if (i >= 0 && i < 14) days[i]++;
  });
  return days;
}

export default function Admin() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const isDedicatedAdminHost = window.location.hostname.split('.')[0].toLowerCase() === 'admin';

  // 独立 admin 子域名不会加载主站 App，因此在此补充管理员后台的在线心跳。
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
  const [moreOpen, setMoreOpen] = useState(false);
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

  function switchTab(id: string) {
    setTab(id); setMsg(''); setMoreOpen(false);
    window.scrollTo({ top: 0 });
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
      padding: '14px 14px 110px',
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

      <form className="admin-search" onSubmit={e => { e.preventDefault(); switchTab('members'); }} style={{ marginBottom: 12 }}>
        <input value={q0} onChange={e => setQ0(e.target.value)} placeholder="搜索成员姓名 / 用户名…"
          style={{
            width: '100%', boxSizing: 'border-box', background: '#ffffff0d',
            border: '1px solid #ffffff14', borderRadius: 10, padding: '9px 12px',
            color: '#fff', fontSize: 13, outline: 'none',
          }} />
      </form>

      {msg && <p className="priv-note" style={{ margin: '0 0 10px' }}>{msg}</p>}

      <div className="admin-content" key={tab} aria-live="polite">
        {tab === 'overview' && <Overview setMsg={setMsg} go={setTab} />}
              {tab === 'members' && <Members me={me} isSuper={isSuper} setMsg={setMsg} extQ={q0} />}
              {tab === 'accounts' && isSuper && <AdminAccountManagement me={me} isSuper={isSuper} setMsg={setMsg} />}
              {tab === 'moderate' && <Moderate setMsg={setMsg} />}
              {tab === 'loveWall' && <AdminLoveWall setMsg={setMsg} />}
              {tab === 'notifications' && <AdminNotificationCenter setMsg={setMsg} />}
              {tab === 'songWall' && <AdminSongWall setMsg={setMsg} />}
              {tab === 'bulkEmail' && <AdminBulkEmail setMsg={setMsg} />}
              {tab === 'board' && <BoardMgr me={me} setMsg={setMsg} />}
              {tab === 'events' && <EventTab me={me} setMsg={setMsg} />}
              {tab === 'logs' && <Logs />}
              {tab === 'system' && isSuper && <AdminSystemCenter setMsg={setMsg} />}
              {tab === 'settings' && isSuper && <Settings me={me} setMsg={setMsg} />}
              {tab === 'invite' && <InviteTab isSuper={isSuper} setMsg={setMsg} />}
              {tab === 'feedback' && <FeedbackTab me={me} isSuper={isSuper} setMsg={setMsg} />}
              {tab === 'game' && <GameTab setMsg={setMsg} />}
              {tab === 'test' && isSuper && <TestTab setMsg={setMsg} />}
      </div>

      {/* 手机端更多入口：把低频管理功能收进轻量菜单 */}
      {moreOpen && (
        <div className="admin-mobile-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="admin-mobile-more" role="dialog" aria-label="更多管理功能" onClick={e => e.stopPropagation()}>
            <div className="admin-mobile-more-head">
              <div><strong>更多功能</strong><span>管理工具与系统设置</span></div>
              <button type="button" aria-label="关闭" onClick={() => setMoreOpen(false)}>×</button>
            </div>
            <div className="admin-mobile-more-grid">
              {tabs.filter(([id]) => !['overview','members','moderate','notifications'].includes(id)).map(([id,label]) => (
                <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => switchTab(id)}>
                  <span>{label}</span><span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 手机端精简 Dock */}
      <nav className="admin-mobile-dock" aria-label="管理员主导航">
        {tabs.filter(([id]) => ['overview','members','moderate','notifications'].includes(id)).map(([id,label]) => (
          <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => switchTab(id)}>
            <span className="admin-mobile-dock-dot" />
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className={moreOpen || !['overview','members','moderate','notifications'].includes(tab) ? 'active' : ''} aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)}>
          <span className="admin-mobile-dock-more">···</span>
          <span>更多</span>
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
        </div>
      </div>
    </div>
  );
}

/* ---------------- 总览（仪表盘） ---------------- */
// 总览顶部待办中心：五个待处理队列的计数汇总在一处，点一行直达对应页签处理。
function TodoCenter({ go }: { go: (tab: string) => void }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState(false);

  async function load() {
    const queries = [
      supabase.from('love_wall_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('song_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('game_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('feedbacks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ];
    const res = await Promise.all(queries);
    if (res.some(r => r.error)) { setErr(true); return; }
    setErr(false);
    setCounts({ love: res[0].count ?? 0, song: res[1].count ?? 0, game: res[2].count ?? 0, report: res[3].count ?? 0, feedback: res[4].count ?? 0 });
  }
  useEffect(() => { void load(); }, []);

  const items: [string, string, string][] = [
    ['love', '表白待审核', 'loveWall'],
    ['song', '歌曲待审核', 'songWall'],
    ['game', '段位待审核', 'game'],
    ['report', '举报待处理', 'moderate'],
    ['feedback', '反馈未处理', 'feedback'],
  ];
  const total = counts ? items.reduce((a, [k]) => a + (counts[k] || 0), 0) : 0;
  return <div style={card}>
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <h3 style={{ ...h3, margin: 0 }}>待处理{counts && total > 0 ? `（共 ${total} 件）` : ''}</h3>
      <button className="mini ghost" onClick={() => void load()}>刷新</button>
    </div>
    {err && <p style={mut}>待办计数读取失败，点刷新重试。</p>}
    {!counts && !err && <p style={mut}>正在统计…</p>}
    {counts && total === 0 && !err && <p style={{ fontSize: 13.5, color: '#7ee2a8', margin: '6px 0 2px' }}>全部处理完了，没有积压。</p>}
    {counts && items.map(([k, label, tab]) => (
      <button key={k} onClick={() => go(tab)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 2px', background: 'transparent', border: 0, borderBottom: '1px solid #ffffff0a', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, fontSize: 13.5, color: (counts[k] || 0) === 0 ? '#8b93b0' : '#eef0ff' }}>{label}</span>
        {(counts[k] || 0) > 0
          ? <span style={{ background: '#f5c26b', color: '#231a04', fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '2px 9px' }}>{counts[k]}</span>
          : <span style={{ fontSize: 12, color: '#69718c' }}>无</span>}
        <span style={{ color: '#8b93b0', fontSize: 13 }}>›</span>
      </button>
    ))}
  </div>;
}

function Overview({ setMsg, go }: { setMsg: (s: string) => void; go: (tab: string) => void }) {
  const [st, setSt] = useState<any>(null);
  const [presence, setPresence] = useState<{ online: number; active: number; sampledAt: string; error: boolean } | null>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  // 在线人数只向服务器请求聚合计数（admin_presence_summary），管理端不订阅
  // 任何成员级 Presence 或明细数据，因此拿不到在线名单和账号 ID。
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let requestSeq = 0;
    const refreshPresence = async () => {
      if (document.visibilityState !== 'visible') return;
      // 去重：visibilitychange、focus 与定时器可能同时触发，已有请求在飞时跳过。
      if (inFlight) return;
      inFlight = true;
      const seq = ++requestSeq;
      try {
        const { data, error } = await supabase.rpc('admin_presence_summary');
        // 只接受最新一次请求的结果，避免较早返回的结果覆盖较新的数据。
        if (!alive || seq !== requestSeq) return;
        if (error || !data) {
          // 保留上次成功的人数并标记为可能过期，不用错误状态遮住已有数字。
          setPresence(prev => prev ? { ...prev, error: true } : { online: 0, active: 0, sampledAt: '', error: true });
          return;
        }
        setPresence({
          online: Number(data.online_count ?? 0),
          active: Number(data.active_count ?? 0),
          sampledAt: data.sampled_at ?? new Date().toISOString(),
          error: false,
        });
      } finally {
        inFlight = false;
      }
    };
    void refreshPresence();
    const timer = window.setInterval(() => { void refreshPresence(); }, 15 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshPresence(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const since14 = new Date(Date.now() - 14 * 864e5).toISOString();
        const [m, p, c, ph, r, nm, pr, por, phr] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('posts').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('comments').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('album_photos').select('id', { count: 'exact', head: true }),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('profiles').select('id, display_name, username, created_at')
            .order('created_at', { ascending: false }).limit(5),
          supabase.from('profiles').select('created_at').gte('created_at', since14),
          supabase.from('posts').select('created_at').gte('created_at', since14).is('deleted_at', null),
          supabase.from('album_photos').select('created_at').gte('created_at', since14),
        ]);
        const week = new Date(Date.now() - 7 * 864e5).toISOString();
        const { count: new7 } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', week);
        const { data: logs } = await supabase.from('admin_audit_logs')
          .select('id, action, created_at').order('created_at', { ascending: false }).limit(5);
        const t0 = Date.now();
        const { error: pingErr } = await supabase.from('profiles').select('id', { head: true }).limit(1);
        const dPro = bucket14((pr.data ?? []) as any[]);
        const dPost = bucket14((por.data ?? []) as any[]);
        const dPhoto = bucket14((phr.data ?? []) as any[]);
        let acc = (m.count ?? 0) - dPro.reduce((a, b) => a + b, 0);
        const cum = dPro.map(v => (acc += v));
        setSt({
          members: m.count ?? 0, posts: p.count ?? 0, comments: c.count ?? 0,
          photos: ph.count ?? 0, pendingReports: r.count ?? 0, new7: new7 ?? 0,
          newMembers: nm.data ?? [], recentLogs: logs ?? [],
          dbOk: !pingErr, dbMs: Date.now() - t0,
          dPro, dPost, dPhoto, cum,
        });
      } catch (e: any) { setMsg('总览加载失败：' + (e.message || '')); }
    })();
  }, []);
  useEffect(() => {
    if (st) return;
    const timer = window.setTimeout(() => setLoadTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, [st]);
  if (!st && !loadTimedOut) return <div className="admin-overview-loading" role="status"><span className="admin-loading-pulse" />正在整理总览数据…</div>;
  if (!st) return <div className="admin-overview-timeout"><strong>总览数据暂时没有响应</strong><p>后台其他功能仍可使用。请检查网络后重试。</p><button type="button" onClick={() => window.location.reload()}>刷新重试</button></div>;
  const segs = [
    { label: '成员', v: st.members, color: '#5b8cff' },
    { label: '动态', v: st.posts, color: '#8b5cf6' },
    { label: '照片', v: st.photos, color: '#4ade80' },
    { label: '评论', v: st.comments, color: '#f5a623' },
  ];
  const tot = segs.reduce((a, s) => a + s.v, 0);
  const dlabels = [0, 3, 6, 10, 13].map(i => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return `${d.getMonth() + 1}-${d.getDate()}`;
  });
  const statSub: Record<string, React.ReactNode> = {
    '注册成员': <span style={{ color: '#4ade80' }}>较7天前 +{st.new7}</span>,
    '近7天新增': <span style={{ color: '#4ade80' }}>新增注册</span>,
    '班级动态': st.posts === 0 ? <span style={{ color: '#8b93b0' }}>暂无新动态</span> : <span style={{ color: '#4ade80' }}>持续更新中</span>,
    '班级照片': st.photos === 0 ? <span style={{ color: '#8b93b0' }}>暂无新照片</span> : <span style={{ color: '#4ade80' }}>持续更新中</span>,
  };
  const stats: [string, number, number[], string][] = [
    ['注册成员', st.members, st.cum, '#5b8cff'],
    ['近7天新增', st.new7, st.dPro.slice(-7), '#8b5cf6'],
    ['班级动态', st.posts, st.dPost, '#4ade80'],
    ['班级照片', st.photos, st.dPhoto, '#f5a623'],
  ];
  return (<>
    <TodoCenter go={go} />
    <div className="admin-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
      {stats.map(([k, v, d, col]) => (
        <div key={k} style={{ ...card, marginBottom: 0, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#8b93b0' }}>{k}</div>
          <div style={{ fontSize: 24, fontWeight: 800, margin: '4px 0', color: '#fff' }}>{v}</div>
          <div style={{ fontSize: 10.5 }}>{statSub[k]}</div>
          <Spark data={d} color={col} />
        </div>
      ))}
    </div>
    <div style={card}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <b style={{ fontSize: 13 }}>近14天注册趋势</b>
        <span style={{ fontSize: 10.5, color: '#8b93b0', border: '1px solid #ffffff1c', borderRadius: 8, padding: '2px 8px' }}>近14天</span>
      </div>
      <TrendChart data={st.dPro} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b93b0' }}>
        {dlabels.map(l => <span key={l}>{l}</span>)}
      </div>
    </div>
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
      <Donut segs={segs} />
      <div style={{ fontSize: 11.5, color: '#aeb7d4', lineHeight: 2.1 }}>
        {segs.map(s => (
          <div key={s.label}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 6 }} />
            {s.label} {s.v} <span style={{ color: '#8b93b0' }}>{tot ? Math.round((s.v / tot) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
    <div style={card}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>最近管理操作</b>
        <span style={{ fontSize: 11, color: '#5b8cff' }}>共 {st.recentLogs.length} 条</span>
      </div>
      {(st.recentLogs as any[]).map((l: any) => (
        <div key={l.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid #ffffff0a', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#c6cde6' }}>{l.action}</span>
          <span style={{ color: '#8b93b0', fontSize: 10.5 }}>{(l.created_at || '').slice(5, 16).replace('T', ' ')}</span>
        </div>
      ))}
      {st.recentLogs.length === 0 && <p style={mut}>暂无</p>}
    </div>
    <div style={card}>
      <h3 style={h3}>最近加入</h3>
      {(st.newMembers as any[]).map((m: any) => (
        <div key={m.id} style={{ fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid #ffffff0a' }}>
          {m.display_name || m.username} <span style={mut}>· {timeAgo(m.created_at)}</span>
        </div>
      ))}
      {st.newMembers.length === 0 && <p style={mut}>暂无</p>}
    </div>
    <div style={card}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ ...h3, margin: 0 }}>在线统计</h3>
        <span style={{ fontSize: 10.5, color: presence?.error ? '#ffb4b4' : '#4ade80' }}>
          {presence?.error ? (presence.sampledAt ? '刷新失败 · 显示上次结果' : '数据暂不可用') : '自动刷新 · 15 秒'}
        </span>
      </div>
      <div className="admin-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: '#ffffff0a', border: '1px solid #ffffff12', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#8b93b0' }}>近 5 分钟活跃</div>
          <div style={{ fontSize: 30, lineHeight: 1.2, fontWeight: 850, color: '#4ade80', marginTop: 4 }}>
            {presence && presence.sampledAt ? presence.online : '—'}
          </div>
          <div style={{ fontSize: 10.5, color: '#8b93b0', marginTop: 4 }}>5 分钟内有活动即计入</div>
        </div>
        <div style={{ background: '#ffffff0a', border: '1px solid #ffffff12', borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#8b93b0' }}>近 30 分钟活跃</div>
          <div style={{ fontSize: 30, lineHeight: 1.2, fontWeight: 850, color: '#8bb5ff', marginTop: 4 }}>
            {presence && presence.sampledAt ? presence.active : '—'}
          </div>
          <div style={{ fontSize: 10.5, color: '#8b93b0', marginTop: 4 }}>30 分钟内有活动即计入</div>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: '#8b93b0', marginTop: 10, lineHeight: 1.6 }}>
        这是活动窗口统计，不是即时连接人数：关掉页面的人在窗口结束前仍会计入，满窗口无活动后自动移出。按不同账号去重；同一账号多设备只计 1 人。人数由服务器聚合统计，管理端只收到总人数，不接收在线名单。{presence?.sampledAt ? `最近采样：${new Date(presence.sampledAt).toLocaleTimeString()}` : '等待首次采样…'}
      </div>
    </div>
    <div style={card}>
      <h3 style={h3}>系统状态</h3>
      <div style={{ fontSize: 13.5, lineHeight: 2 }}>
        <div>数据库：{st.dbOk ? <span style={{ color: '#4ade80' }}>连接正常（{st.dbMs}ms）</span> : <span style={{ color: '#ff8080' }}>连接异常</span>}</div>
        {st.pendingReports > 0 && <div>待处理举报：<span style={{ color: '#f5a623' }}>{st.pendingReports} 条</span></div>}
      </div>
    </div>
  </>);
}

/* ---------------- 成员管理 ---------------- */
function Members({ me, isSuper, setMsg, extQ }: { me: string; isSuper: boolean; setMsg: (s: string) => void; extQ: string }) {
  const [list, setList] = useState<Member[]>([]);
  const [q, setQ] = useState(extQ);
  useEffect(() => { if (extQ) setQ(extQ); }, [extQ]);
  const [fRole, setFRole] = useState('all');
  const [fJoined, setFJoined] = useState('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const PER = 20;

  async function load() {
    const { data } = await supabase.from('profiles')
      .select('id, username, display_name, real_name, role, joined, created_at')
      .order('created_at', { ascending: false }).limit(500);
    setList((data ?? []) as Member[]);
  }
  useEffect(() => { load(); }, []);

  const filtered = list.filter(m => {
    if (fRole !== 'all' && m.role !== fRole) return false;
    if (fJoined === 'joined' && !m.joined) return false;
    if (fJoined === 'unjoined' && m.joined) return false;
    if (q) {
      const s = (q || '').toLowerCase();
      return (m.display_name || '').toLowerCase().includes(s) || m.username.toLowerCase().includes(s)
        || (m.real_name || '').toLowerCase().includes(s);
    }
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const shown = filtered.slice(page * PER, (page + 1) * PER);

  async function setJoined(ids: string[], joined: boolean) {
    if (!confirm(`${joined ? '恢复' : '禁用'}选中的 ${ids.length} 个账号？`)) return;
    for (const id of ids) {
      const { error } = await supabase.rpc('set_joined', { target: id, j: joined });
      if (!error) await alog(joined ? 'member_restore' : 'member_ban', { target: id });
    }
    setSel(new Set()); load(); setMsg('已处理');
  }
  async function setRole(id: string, newRole: string, name: string) {
    if (id === me) return setMsg('不能修改自己的角色');
    if (!confirm(`把 ${name} 设为${newRole === 'super_admin' ? '超级管理员' : newRole === 'admin' ? '内容管理员' : '普通成员'}？`)) return;
    const { error } = await supabase.rpc('set_role', { target: id, new_role: newRole });
    setMsg(error ? '失败：' + error.message : '角色已更新');
    if (!error) load();
  }

  return (<>
    <div style={{ ...card }}>
      <h3 style={h3}>成员（{filtered.length}）</h3>
      <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="搜索名字 / 用户名 / 真实姓名" style={{ marginBottom: 8 }} />
      <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {([['all', '全部角色'], ['member', '成员'], ['admin', '内容管理员'], ['super_admin', '超级管理员']] as const).map(([k, l]) => (
          <button key={k} className={'mini' + (fRole === k ? '' : ' ghost')} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => { setFRole(k); setPage(0); }}>{l}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 4, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {([['all', '全部状态'], ['joined', '正常'], ['unjoined', '已禁用']] as const).map(([k, l]) => (
          <button key={k} className={'mini' + (fJoined === k ? '' : ' ghost')} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => { setFJoined(k); setPage(0); }}>{l}</button>
        ))}
      </div>
      {sel.size > 0 && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="mini" onClick={() => setJoined([...sel], true)}>恢复选中（{sel.size}）</button>
          <button className="mini danger" onClick={() => setJoined([...sel], false)}>禁用选中（{sel.size}）</button>
          <button className="mini ghost" onClick={() => setSel(new Set())}>取消选择</button>
        </div>
      )}
    </div>
    {shown.map(m => (
      <div key={m.id} style={{ ...card, opacity: m.joined ? 1 : 0.55 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={sel.has(m.id)}
            onChange={e => { const n = new Set(sel); e.target.checked ? n.add(m.id) : n.delete(m.id); setSel(n); }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              <span onClick={() => setDetailId(m.id)} style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>{m.display_name || m.username}</span>
              <span style={{ ...mut, marginLeft: 8 }}>{m.role === 'super_admin' ? '超级管理员' : m.role === 'admin' ? '内容管理员' : '成员'}</span>
              {!m.joined && <span style={{ color: '#ff8080', fontSize: 12 }}> · 已禁用</span>}
            </div>
            <div style={mut}>@{m.username}{m.real_name ? ` · ${m.real_name}` : ''} · {timeAgo(m.created_at)}</div>
          </div>
        </div>
        <div style={rowBtn}>
          {m.joined
            ? <button className="mini danger" disabled={m.id === me} onClick={() => setJoined([m.id], false)}>禁用</button>
            : <button className="mini" onClick={() => setJoined([m.id], true)}>恢复</button>}
          {isSuper && m.role !== 'super_admin' && (
            <select value={m.role} onChange={e => setRole(m.id, e.target.value, m.display_name || m.username)}
              style={{ width: 'auto', padding: '6px 8px', fontSize: 12.5 }} disabled={m.id === me}>
              <option value="member">普通成员</option>
              <option value="admin">内容管理员</option>
              <option value="super_admin">超级管理员</option>
            </select>
          )}
        </div>
      </div>
    ))}
    {pages > 1 && (
      <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 4 }}>
        <button className="mini ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>上一页</button>
        <span style={mut}>{page + 1} / {pages}</span>
        <button className="mini ghost" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>下一页</button>
      </div>
    )}
    {detailId && <AdminMemberModal memberId={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
  </>);
}

/* ---------------- 内容审核 ---------------- */
function BoardMgr({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [bannerText, setBannerText] = useState('把我们的青春，留在这里');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerBusy, setBannerBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [exp, setExp] = useState('0');
  const [popupTimes, setPopupTimes] = useState('1');
  const [list, setList] = useState<any[]>([]);
  const POP_CYCLE = ['0', '1', '2', '3', '999'];
  const popLabel = (v: any) => ({ '0': '关', '1': '1次', '2': '2次', '3': '3次', '999': '每次' } as any)[String(v ?? '0')] ?? '关';
  async function load() {
    const { data } = await supabase.from('board_messages')
      .select('id, title, content, is_pinned, popup_on_login, popup_times, expires_at, created_at').eq('is_admin_msg', true).is('deleted_at', null)
      .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20);
    setList(data ?? []);
  }
  useEffect(() => { load(); supabase.from('site_settings').select('key,value').in('key',['home_banner_text','home_banner_url']).then(({data}) => { (data ?? []).forEach((x:any) => { if(x.key==='home_banner_text') setBannerText(x.value || '把我们的青春，留在这里'); if(x.key==='home_banner_url') setBannerUrl(x.value || ''); }); }); }, []);
  async function saveBanner() {
    setBannerBusy(true); let failure = '';
    for (const item of [{key:'home_banner_text',value:bannerText.trim().slice(0,100) || '把我们的青春，留在这里'},{key:'home_banner_url',value:bannerUrl.trim()}]) {
      const {data: found,error: readError} = await supabase.from('site_settings').select('key').eq('key',item.key).maybeSingle();
      if(readError) { failure=readError.message; break; }
      const result = found ? await supabase.from('site_settings').update({value:item.value}).eq('key',item.key) : await supabase.from('site_settings').insert(item);
      if(result.error) { failure=result.error.message; break; }
    }
    setBannerBusy(false); setMsg(failure ? '横幅保存失败：'+failure : '首页横幅设置已保存');
  }
  async function post() {
    const c = text.trim(); if (!c) return setMsg('先写点公告内容');
    const days = parseInt(exp, 10);
    const pt = parseInt(popupTimes, 10);
    const { error } = await supabase.from('board_messages').insert({
      author_id: me, title: title.trim().slice(0, 60) || null, content: c.slice(0, 500), is_admin_msg: true,
      expires_at: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null,
      popup_on_login: pt > 0, popup_times: pt,
    });
    if (!error) { await alog('notice_post', { len: c.length, popup_times: pt }); setTitle(''); setText(''); setExp('0'); setPopupTimes('1'); load(); setMsg('公告已发布'); }
    else setMsg('发布失败：' + error.message);
  }
  async function togglePin(n: any) {
    const { error } = await supabase.from('board_messages').update({ is_pinned: !n.is_pinned }).eq('id', n.id);
    if (!error) { await alog(n.is_pinned ? 'notice_unpin' : 'notice_pin', { id: n.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function cyclePopup(n: any) {
    const cur = String(n.popup_times ?? (n.popup_on_login ? 1 : 0));
    const next = POP_CYCLE[(POP_CYCLE.indexOf(cur) + 1) % POP_CYCLE.length];
    const pt = parseInt(next, 10);
    const { error } = await supabase.from('board_messages').update({ popup_on_login: pt > 0, popup_times: pt }).eq('id', n.id);
    if (!error) { await alog('notice_popup_set', { id: n.id, times: pt }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function del(id: number) {
    if (!confirm('删除这条公告？')) return;
    // 软删除进回收站
    const { error } = await supabase.from('board_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (!error) { await alog('notice_hide', { id }); load(); }
    else setMsg('失败：' + error.message);
  }
  return (
    <div style={card}>
      <h3 style={h3}>首页 16:9 横幅</h3>
      <p style={mut}>在这里设置首页横幅文字和图片地址；图片建议使用横向 16:9 图片的 HTTPS 地址。</p>
      <input value={bannerText} onChange={e=>setBannerText(e.target.value)} maxLength={100} placeholder="横幅标题文字" />
      <input value={bannerUrl} onChange={e=>setBannerUrl(e.target.value)} placeholder="图片 HTTPS 地址（可留空）" />
      <div style={rowBtn}><button className="pri" style={{width:'auto',padding:'10px 20px'}} disabled={bannerBusy} onClick={saveBanner}>{bannerBusy?'保存中…':'保存横幅'}</button><button className="mini ghost" disabled={bannerBusy} onClick={()=>setBannerUrl('')}>移除图片</button></div>
      <hr style={{border:0,borderTop:'1px solid #e5e7eb',margin:'18px 0'}} />
      <h3 style={h3}>公告管理</h3>
      <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="公告标题（可选）" style={{ marginBottom: 8 }} />
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={500} placeholder="写公告…" style={{ width: '100%' }} />
      <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={post}>发布公告</button>
        <span style={mut}>过期：</span>
        <select value={exp} onChange={e => setExp(e.target.value)} style={{ width: 'auto', padding: '8px' }}>
          <option value="0">不过期</option><option value="1">1 天</option>
          <option value="3">3 天</option><option value="7">7 天</option><option value="30">30 天</option>
        </select>
        <span style={mut}>登录弹窗：</span>
        <select value={popupTimes} onChange={e => setPopupTimes(e.target.value)} style={{ width: 'auto', padding: '8px' }}>
          <option value="0">不弹窗</option><option value="1">弹1次</option>
          <option value="2">弹2次</option><option value="3">弹3次</option>
          <option value="999">每次都弹</option>
        </select>
      </div>
      <div style={{ marginTop: 12 }}>
        {list.map(n => (
          <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <div style={{ fontSize: 13.5 }}>
              {n.is_pinned && '📌 '}
              {n.title && <b style={{ color: '#fff' }}>{n.title} </b>}
              {(n.content || '').slice(0, 80)}
            </div>
            <div style={mut}>{(n.created_at || '').slice(0, 16).replace('T', ' ')}
              {n.expires_at ? ` · 过期 ${n.expires_at.slice(0, 16).replace('T', ' ')}` : ' · 不过期'}
              {(n.popup_on_login || (n.popup_times ?? 0) > 0) ? ` · 弹窗${popLabel(n.popup_times)}` : ''}</div>
            <div style={rowBtn}>
              <button className="mini ghost" onClick={() => togglePin(n)}>{n.is_pinned ? '取消置顶' : '置顶'}</button>
              <button className="mini ghost" onClick={() => cyclePopup(n)}>弹窗：{popLabel(n.popup_times ?? (n.popup_on_login ? 1 : 0))}</button>
              <button className="mini danger" onClick={() => del(n.id)}>撤下</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p style={mut}>暂无公告</p>}
      </div>
    </div>
  );
}

/* ---------------- 日志 ---------------- */
/* ---------------- 系统设置（仅超管） ---------------- */
