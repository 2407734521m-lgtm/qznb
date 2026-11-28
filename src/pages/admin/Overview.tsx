import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, type MotionProps } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { startSitePresence, type SitePresenceSnapshot } from '../../lib/sitePresence';
import { card, h3, mut, timeAgo, bucket30 } from './shared';
import DotDigits from '../../components/admin/DotDigits';
import { Spark, SparkBars, TrendChart } from './charts';

/* STEP 3 (Flux rebuild): mini-chart tone is real, never decorative.
   Daily series: last 7 days vs the previous 7. Cumulative members: the
   last value against the value 7 days back. Up = green, down = red,
   flat = gold. STEP 5: the window is 30 days now, so the comparison is
   anchored at the end of the series instead of fixed slice offsets. */
function trendTone(data: number[], cumulative = false): string {
  if (data.length < 8) return '#b28b3d';
  if (cumulative) {
    const now = data[data.length - 1];
    const back = data[data.length - 8];
    if (now > back) return '#2e9e6b';
    if (now < back) return '#d05a4e';
    return '#b28b3d';
  }
  const prev = data.slice(-14, -7).reduce((a, b) => a + b, 0);
  const last = data.slice(-7).reduce((a, b) => a + b, 0);
  if (last > prev) return '#2e9e6b';
  if (last < prev) return '#d05a4e';
  return '#b28b3d';
}

/* STEP 6 (Flux rebuild polish): one shared rise-in for the overview
   sections — 0.28s easeOut, small stagger, no overshoot (DESIGN.md §6:
   page / panel transitions 200–320ms). Reduced motion renders
   everything in its final state; the caller passes useReducedMotion. */
function riseProps(reduce: boolean | null, delay: number): MotionProps {
  if (reduce) return {};
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.28, delay, ease: 'easeOut' },
  };
}

/* STEP 6: press feedback shared by the overview's own buttons — a
   0.04 shrink on tap. Reduced motion disables it. */
function tapProps(reduce: boolean | null): MotionProps {
  if (reduce) return {};
  return { whileTap: { scale: 0.97 } };
}

/* ---------------- 总览（仪表盘） ---------------- */
// 总览顶部待办中心：五个待处理队列的计数汇总在一处，点一行直达对应页签处理。
function TodoCenter({ go }: { go: (tab: string) => void }) {
  const reduce = useReducedMotion();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState(false);

  async function load() {
    try {
    const queries = [
      supabase.from('love_wall_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('song_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('game_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('feedbacks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ];
    const res = await Promise.all(queries);
    if (res.some(r => r.error)) { setCounts(null); setErr(true); return; }
    setErr(false);
    setCounts({ love: res[0].count ?? 0, song: res[1].count ?? 0, game: res[2].count ?? 0, report: res[3].count ?? 0, feedback: res[4].count ?? 0 });
    } catch {
      setCounts(null);
      setErr(true);
    }
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
    {counts && total === 0 && !err && <p className="admin-overview-todo-done" style={{ fontSize: 13.5, color: '#2e7d4f', margin: '6px 0 2px' }}>全部处理完了，没有积压。</p>}
    {counts && items.map(([k, label, tab]) => (
      <motion.button key={k} onClick={() => go(tab)} {...tapProps(reduce)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 2px', background: 'transparent', border: 0, borderBottom: '1px solid rgba(31,42,58,.08)', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, fontSize: 13.5, color: (counts[k] || 0) === 0 ? '#5d686f' : '#1f2a3a' }}>{label}</span>
        {(counts[k] || 0) > 0
          ? <span style={{ background: '#b0404f', color: '#fff', fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '2px 9px' }}>{counts[k]}</span>
          : <span style={{ fontSize: 12, color: '#5d686f' }}>无</span>}
        <span style={{ color: '#5d686f', fontSize: 13 }}>›</span>
      </motion.button>
    ))}
  </div>;
}

/* ---------------- 客户端构成（总览底部卡） ---------------- */
// 数据来自 admin_client_stats RPC：按 member_presence 每位成员最近一次上报的 client 聚合，
// 只给管理员看计数与版本分布，不展示成员身份。
type ClientStats = {
  total: number; app: number; web: number; admin: number; unknown: number;
  versions: { kind: string; version: string; count: number }[];
};
function ClientStatsCard() {
  const reduce = useReducedMotion();
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [err, setErr] = useState(false);

  async function load() {
    const { data, error } = await supabase.rpc('admin_client_stats');
    if (error || !data) { setErr(true); return; }
    setErr(false);
    setStats(data as ClientStats);
  }
  useEffect(() => { void load(); }, []);

  const rows: [string, number][] = stats ? [
    ['用户端应用', stats.app],
    ['网页版', stats.web],
    ['管理端应用', stats.admin],
    ['未识别客户端', stats.unknown],
  ] : [];
  const identified = stats ? stats.app + stats.web + stats.admin : 0;
  const ratio = stats && stats.total > 0 ? Math.round(identified / stats.total * 100) : null;
  /* Grove 改版：环形三段按 Grove 配色（橙 / 绿 / 蓝 = 用户端应用 /
     网页版 / 管理端应用），未识别一段走暖灰轨道，与图例圆点一致。 */
  const gaugeColors = ['#FEB66E', '#5DBE63', '#A2C8D2'];
  let gaugeBackground: string | undefined;
  if (stats && stats.total > 0) {
    if (identified > 0) {
      const identifiedShare = (identified / stats.total) * 100;
      const parts: string[] = [];
      let acc = 0;
      [stats.app, stats.web, stats.admin].forEach((v, i) => {
        if (v <= 0) return;
        const len = (v / identified) * identifiedShare;
        const end = acc + len;
        parts.push(`${gaugeColors[i]} ${acc.toFixed(2)}% ${Math.max(end - 1.2, acc).toFixed(2)}%`);
        acc = end;
      });
      gaugeBackground = `conic-gradient(${parts.join(', ')}, #E9E2D5 ${acc.toFixed(2)}% 100%)`;
    } else {
      gaugeBackground = 'conic-gradient(#E9E2D5 0 100%)';
    }
  }
  /* Grove 改版：分布条与图例共用同一组颜色（第四段未识别走暖灰）；
     刻度点落在各段按占总数的累计边界上。 */
  const distColors = [...gaugeColors, '#E3DCCF'];
  const distBoundaries: number[] = [];
  if (stats && stats.total > 0) {
    let acc = 0;
    rows.forEach(([, count]) => {
      acc += count;
      if (count > 0 && acc < stats.total) distBoundaries.push((acc / stats.total) * 100);
    });
  }
  return <motion.section className="admin-overview-client-card" {...riseProps(reduce, 0.15)}>
    <div className="admin-overview-panel-heading">
      <div><h3>客户端分布</h3><p>依据成员最近一次客户端上报汇总</p></div>
      <button className="mini ghost" type="button" onClick={() => void load()}>刷新</button>
    </div>
    {err && <p className="admin-overview-empty">客户端统计读取失败，点刷新重试。</p>}
    {!stats && !err && <p className="admin-overview-empty">正在统计…</p>}
    {stats && (
      <>
        <div className="admin-overview-client-summary">
          {/* STEP 6: the ring fades in (its conic-gradient can't sweep),
              the centre ratio counts up with the shared NumberTicker. */}
          <motion.div className="admin-overview-client-gauge" style={gaugeBackground ? { background: gaugeBackground } : undefined}
            initial={reduce ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: 0.2, ease: 'easeOut' }}>
            <div className="admin-overview-client-gauge-inner">
              {/* Grove 改版：环形中心比率用小号点阵数字（含 % 号）。 */}
              <strong>{ratio === null ? '—' : <DotDigits value={`${ratio}%`} size="sm" label={`已识别 ${ratio}%`} />}</strong>
              <span>已识别</span>
            </div>
          </motion.div>
          <div className="admin-overview-client-total">
            <strong>{stats.total.toLocaleString('zh-CN')}</strong>
            <span>条客户端记录</span>
            <small>{identified.toLocaleString('zh-CN')} 条已识别类型</small>
          </div>
        </div>
        <div className="admin-overview-client-legend">
          {rows.map(([label, count], index) => (
            <motion.div className="admin-overview-client-legend-row" key={label}
              initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.25 + index * 0.05, ease: 'easeOut' }}>
              <i className={`tone-${index}`} aria-hidden="true" />
              <span>{label}</span>
              <strong>{count.toLocaleString('zh-CN')}</strong>
            </motion.div>
          ))}
        </div>
        {/* Grove 改版：细线圆点刻度分布条——同一组计数按占总数的份额
            横向展开；标签一行排开、强制单行显示。 */}
        {stats.total > 0 && (
          <div className="admin-overview-client-dist">
            <div className="admin-overview-client-dist-bar" aria-hidden="true">
              {rows.map(([label, count], index) => count > 0 ? (
                <i key={label} style={{ flexGrow: count, background: distColors[index] }} />
              ) : null)}
            </div>
            <div className="admin-overview-client-dist-ticks" aria-hidden="true">
              {distBoundaries.map(pct => <i key={pct} style={{ left: `${pct}%` }} />)}
            </div>
            <div className="admin-overview-client-dist-labels">
              {rows.map(([label, count], index) => (
                <span key={label}><i style={{ background: distColors[index] }} aria-hidden="true" />{label} {Math.round((count / stats.total) * 100)}%</span>
              ))}
            </div>
          </div>
        )}
        {stats.versions.length > 0 && (
          <p className="admin-overview-client-versions">
            版本：{stats.versions.map(v => `${v.kind === 'admin' ? '管理端' : '用户端'} ${v.version}（${v.count}）`).join(' · ')}
          </p>
        )}
      </>
    )}
  </motion.section>;
}

export default function Overview({ setMsg, go, isSuper }: { setMsg: (s: string) => void; go: (tab: string) => void; isSuper: boolean }) {
  const reduce = useReducedMotion();
  const [st, setSt] = useState<any>(null);
  const [presence, setPresence] = useState<{ online: number; active: number; sampledAt: string; error: boolean } | null>(null);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [realtimeFailed, setRealtimeFailed] = useState(false);
  const realtimeRef = useRef<SitePresenceSnapshot>({
    status: 'connecting', online: null, updatedAt: null,
  });
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [refreshSeq, setRefreshSeq] = useState(0);

  // 管理总览复用站点唯一 Presence 连接，避免监听器再创建一条自计数连接。
  useEffect(() => startSitePresence(next => {
    realtimeRef.current = next;
    const ready = next.status === 'connected';
    setRealtimeReady(ready);
    setRealtimeFailed(next.status === 'error' || next.status === 'closed');
    if (ready && next.online !== null) {
      setPresence(prev => ({
        online: next.online as number,
        active: prev?.active ?? 0,
        sampledAt: next.updatedAt ?? prev?.sampledAt ?? new Date().toISOString(),
        error: false,
      }));
    }
  }), []);

  // Realtime 不可用时回退到原有服务端活动窗口统计；Realtime 正常时仍更新 30 分钟活跃账号数。
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const refreshPresence = async () => {
      if (!alive || document.visibilityState !== 'visible' || inFlight) return;
      inFlight = true;
      try {
        const { data, error } = await supabase.rpc('admin_presence_summary');
        if (!alive) return;
        if (error || !data) {
          if (realtimeRef.current.status !== 'connected') {
            setPresence(prev => prev
              ? { ...prev, error: true }
              : { online: 0, active: 0, sampledAt: '', error: true });
          }
          return;
        }
        const summary = data && typeof data === 'object' && !Array.isArray(data)
          ? data as Record<string, unknown>
          : {};
        const onlineCount = typeof summary.online_count === 'number' ? summary.online_count : 0;
        const activeCount = typeof summary.active_count === 'number' ? summary.active_count : 0;
        const sampledAt = typeof summary.sampled_at === 'string' ? summary.sampled_at : new Date().toISOString();
        const live = realtimeRef.current;
        setPresence(prev => ({
          online: live.status === 'connected' && live.online !== null ? live.online : onlineCount,
          active: activeCount,
          sampledAt: live.status === 'connected' ? (live.updatedAt ?? prev?.sampledAt ?? sampledAt) : sampledAt,
          error: false,
        }));
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
    let active = true;
    (async () => {
      try {
        const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
        const [m, p, c, ph, r, nm, pr, por, phr, pd, pdr, qLove, qSong, qGame, qReport, qFeedback, qBoard, qAppVer] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('section', 'feed').is('deleted_at', null),
          supabase.from('comments').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('album_photos').select('id', { count: 'exact', head: true }),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('profiles').select('id, display_name, username, created_at')
            .order('created_at', { ascending: false }).limit(5),
          supabase.from('profiles').select('created_at').gte('created_at', since30),
          supabase.from('posts').select('created_at').eq('section', 'feed').gte('created_at', since30).is('deleted_at', null),
          supabase.from('album_photos').select('created_at').gte('created_at', since30),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('section', 'daily').is('deleted_at', null),
          supabase.from('posts').select('created_at').eq('section', 'daily').gte('created_at', since30).is('deleted_at', null),
          // STEP 3: guide-checklist inputs (same five queues TodoCenter reads).
          supabase.from('love_wall_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('song_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('game_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('feedbacks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('board_messages').select('id', { count: 'exact', head: true }).eq('is_admin_msg', true).is('deleted_at', null),
          supabase.from('site_settings').select('value').eq('key', 'admin_app_version_name').maybeSingle(),
        ]);
        const critical = [m, p, c, ph, r, nm, pr, por, phr, pd, pdr];
        if (critical.some(result => result.error)) throw new Error('部分核心统计读取失败，请检查权限或网络后重试。');
        /* STEP 3: guide "done" is computed from live data, never hard-coded.
           - 成员与权限： at least one member has joined (members ≥ 1, checked at render)
           - 内容审核： all five moderation queues are empty (0 pending/open)
           - 发布公告： at least one admin announcement exists (board_messages,
             is_admin_msg, not deleted)
           - 应用管理： the admin-app version is configured (site_settings
             admin_app_version_name non-empty — the same key appCenter reads)
           A failed guide query counts as not done; it never fails the page. */
        const guide = {
          queuesClear: [qLove, qSong, qGame, qReport, qFeedback].every(q => !q.error && (q.count ?? 0) === 0),
          board: !qBoard.error && (qBoard.count ?? 0) > 0,
          appVersion: !qAppVer.error && Boolean((qAppVer.data as any)?.value?.trim()),
        };
        const week = new Date(Date.now() - 7 * 864e5).toISOString();
        const { count: new7, error: new7Error } = await supabase.from('profiles')
          .select('id', { count: 'exact', head: true }).gte('created_at', week);
        if (new7Error) throw new Error('近 7 天新增成员统计读取失败，请重试。');
        const { data: logs, error: logsError } = await supabase.from('admin_audit_logs')
          .select('id, action, created_at').order('created_at', { ascending: false }).limit(5);
        const t0 = Date.now();
        const { error: pingErr } = await supabase.from('profiles').select('id', { head: true }).limit(1);
        const dPro = bucket30((pr.data ?? []) as any[]);
        const dPost = bucket30((por.data ?? []) as any[]);
        const dPhoto = bucket30((phr.data ?? []) as any[]);
        const dDailyPost = bucket30((pdr.data ?? []) as any[]);
        let acc = (m.count ?? 0) - dPro.reduce((a, b) => a + b, 0);
        const cum = dPro.map(v => (acc += v));
        if (!active) return;
        setSt({
          loadedAt: new Date().toISOString(),
          members: m.count ?? 0, posts: p.count ?? 0, dailyPosts: pd.count ?? 0, comments: c.count ?? 0,
          photos: ph.count ?? 0, pendingReports: r.count ?? 0, new7: new7 ?? 0,
          newMembers: nm.data ?? [], recentLogs: logs ?? [], logsError: Boolean(logsError),
          dbOk: !pingErr, dbMs: Date.now() - t0,
          dPro, dPost, dDailyPost, dPhoto, cum, guide,
        });
      } catch (e: any) { if (active) setMsg('总览加载失败：' + (e.message || '')); }
    })();
    return () => { active = false; };
  }, [refreshSeq]);
  useEffect(() => {
    if (st) return;
    const timer = window.setTimeout(() => setLoadTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, [st, refreshSeq]);
  if (!st && !loadTimedOut) return <div className="admin-overview-loading" role="status"><span className="admin-loading-pulse" />正在整理总览数据…</div>;
  if (!st) return <div className="admin-overview-timeout"><strong>总览数据暂时没有响应</strong><p>后台其他功能仍可使用。请检查网络后重试。</p><button type="button" onClick={() => { setLoadTimedOut(false); setRefreshSeq(value => value + 1); }}>重新加载</button></div>;
  /* STEP 5: 30-day window — six evenly spaced axis labels across the
     30 buckets (day 1, 7, 13, 19, 25, 30). */
  const dlabels = [0, 6, 12, 18, 24, 29].map(i => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return `${d.getMonth() + 1}-${d.getDate()}`;
  });
  const statSub: Record<string, React.ReactNode> = {
    '注册成员': <span className="admin-overview-positive">近 7 天新增 +{st.new7}</span>,
    '社区动态': st.posts === 0 ? <span>暂无新动态</span> : <span>持续更新中</span>,
    '日常帖子': st.dailyPosts === 0 ? <span>暂无日常</span> : <span>持续更新中</span>,
    '相册照片': st.photos === 0 ? <span>暂无新照片</span> : <span>持续更新中</span>,
  };
  const stats: [string, number, number[], string, string, 'bars' | 'area'][] = [
    ['注册成员', st.members, st.cum, trendTone(st.cum, true), '人', 'bars'],
    ['社区动态', st.posts, st.dPost, trendTone(st.dPost), '篇', 'area'],
    ['日常帖子', st.dailyPosts, st.dDailyPost, trendTone(st.dDailyPost), '篇', 'area'],
    ['相册照片', st.photos, st.dPhoto, trendTone(st.dPhoto), '张', 'area'],
  ];
  /* STEP 3: guide checklist — same four entries, now with a real completion
     circle each and a progress bar on top. Progress = done / 4. */
  const guide = st.guide as { queuesClear: boolean; board: boolean; appVersion: boolean } | undefined;
  const guideItems: { key: string; title: string; desc: string; tab: string; done: boolean; super?: boolean }[] = [
    { key: 'members', title: '成员与权限', desc: '查看成员账号、角色及状态', tab: 'accounts', done: st.members >= 1, super: true },
    { key: 'moderate', title: '内容审核', desc: '处理举报与待审核内容', tab: 'moderate', done: guide?.queuesClear ?? false },
    { key: 'board', title: '发布公告', desc: '更新站点公告与通知', tab: 'board', done: guide?.board ?? false },
    { key: 'app', title: '应用管理', desc: '查看软件版本和更新说明', tab: 'appCenter', done: guide?.appVersion ?? false },
  ];
  // 超管专属入口对内容管理员隐藏，否则点后是空白页（审计 FIX-4-2）；
  // 进度按可见项算，Admin.tsx 的 switchTab 兜底还会再拦一次。
  const visibleGuideItems = guideItems.filter(item => !item.super || isSuper);
  const guideDone = visibleGuideItems.filter(i => i.done).length;
  const recentLogs = (st.recentLogs as any[]).slice(0, 4);
  /* STEP 5: the trend hero number is the real 30-day new-member count —
     the sum of the 30 daily registration buckets. */
  const new30 = (st.dPro as number[]).reduce((a, b) => a + b, 0);
  const sampledOnline = presence && presence.sampledAt ? presence.online : null;
  const lastSample = presence?.sampledAt ? new Date(presence.sampledAt).toLocaleTimeString() : '等待首次采样';
  return (
    <div className="admin-overview-dashboard admin-overview-reference-layout">
      {/* STEP 2 (Flux rebuild): the welcome hero card is gone — the reference
          opens with a plain title row (title left, action pills right) and
          the live numbers live in the runtime table below. The old
          "系统运行" card is folded into one compact status strip under the
          title so no number is lost: health, online count, DB latency and
          the last sample time. Pills keep their existing handlers/styles;
          the pill look itself is step 3. */}
      <motion.div className="admin-overview-title-row" {...riseProps(reduce, 0)}>
        <div className="admin-overview-title-copy">
          <h2>欢迎回来，管理员</h2>
          <p>{new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())} · 数据更新于 {new Date(st.loadedAt).toLocaleTimeString()}</p>
        </div>
        {/* STEP 3 (Flux rebuild): five action pills like the reference.
            Destinations are real tabs only — no dead buttons. 超管专属的
            药丸（数据分析、文件管理）对内容管理员隐藏，否则点后是空白页
            （审计 FIX-4-2）；Admin.tsx 的 switchTab 兜底还会再拦一次。
            Two honest approximations, because the admin has no dedicated
            page for them (the overseas-video system was removed, and there
            is no file-manager tab):
            - 文件管理 → 设置页 (settings): the media-upload switches live
              there (相册照片上传 / 共享媒体上传).
            - 视频管理 → 公告页 (board): the homepage banner media is
              managed there (home_banner_text/url) — the only
              admin-managed homepage media.
            The old 刷新数据 button moves to the status strip below so its
            function is not lost. The amber fill on the last pill matches
            the reference. */}
        <div className="admin-overview-welcome-actions">
          {([
            ['新任务', 'board', false],
            ['数据分析', 'analytics', true],
            ['报表分析', 'logs', false],
            ['文件管理', 'settings', true],
            ['视频管理', 'board', false],
          ] as [string, string, boolean][]).filter(([, , sup]) => !sup || isSuper).map(([label, tab], i, arr) => (
            <motion.button key={label} type="button" className={i === arr.length - 1 ? 'is-amber' : undefined} onClick={() => go(tab)} {...tapProps(reduce)}>{label}</motion.button>
          ))}
        </div>
      </motion.div>
      <motion.div className="admin-overview-status-strip" role="status" aria-label="站点运行状态" {...riseProps(reduce, 0.05)}>
        <span className={st.dbOk ? 'is-healthy' : 'is-unhealthy'}><i aria-hidden="true" />{st.dbOk ? '运行正常' : '连接异常'}</span>
        <span>当前在线 <strong>{sampledOnline === null ? '—' : sampledOnline}</strong><small>{realtimeReady ? '实时连接' : realtimeFailed ? '备用统计' : '等待连接'}</small></span>
        <span>数据库延迟 <strong>{st.dbOk ? `${st.dbMs} ms` : '异常'}</strong></span>
        <span>在线数据最近更新 <strong>{lastSample}</strong></span>
        <button className="mini ghost" type="button" style={{ marginLeft: 'auto' }} onClick={() => {
          setSt(null);
          setLoadTimedOut(false);
          setRefreshSeq(value => value + 1);
        }}>刷新</button>
      </motion.div>

      <div className="admin-overview-start-grid">
        <motion.section className="admin-overview-guide-panel" {...riseProps(reduce, 0.1)}>
          <div className="admin-overview-guide-heading">
            <div><span className="admin-overview-section-kicker">QUICK START</span><h3>入门指南</h3></div>
            <span>常用管理入口</span>
          </div>
          <div className="admin-overview-guide-progress">
            {/* STEP 6: the bar fills with a 0.5s easeOut instead of jumping
                to its width; the check circles pop when their item is done. */}
            <div className="admin-overview-guide-progress-track"><motion.i
              initial={reduce ? false : { width: 0 }} animate={{ width: `${visibleGuideItems.length ? (guideDone / visibleGuideItems.length) * 100 : 0}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }} /></div>
            <span>已完成 {guideDone}/{visibleGuideItems.length}</span>
          </div>
          <div className="admin-overview-guide-list">
            {visibleGuideItems.map(item => (
              <motion.button key={item.key} type="button" onClick={() => go(item.tab)} {...tapProps(reduce)}>
                <motion.span className={['admin-overview-guide-check', item.done ? 'is-done' : ''].join(' ')} aria-hidden="true"
                  initial={reduce || !item.done ? false : { scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 24 }}>{item.done ? '✓' : ''}</motion.span>
                <span className="admin-overview-guide-copy"><strong>{item.title}</strong><small>{item.desc}</small></span>
                <span className="admin-overview-guide-arrow">↗</span>
              </motion.button>
            ))}
          </div>
        </motion.section>
        <ClientStatsCard />
      </div>

      <section className="admin-overview-primary-grid" aria-label="核心数据">
        {stats.map(([label, value, trend, color, unit, kind], index) => (
          <motion.article key={label} className="admin-overview-metric-card" {...riseProps(reduce, 0.16 + index * 0.05)}
            whileHover={reduce ? undefined : { y: -2 }}>
            <div className="admin-overview-metric-topline">
              <span className="admin-overview-metric-label">{label}</span>
              <span className={`admin-overview-metric-icon tone-${index}`}>{['人', '动', '日', '图'][index]}</span>
            </div>
            {/* Grove 改版：指标大数字用点阵数字（琥珀），单位仍用小字。 */}
            <div className="admin-overview-metric-value"><DotDigits value={value} size="lg" label={`${label} ${value}${unit}`} /><small>{unit}</small></div>
            <div className="admin-overview-metric-hint">{statSub[label]}</div>
            {kind === 'bars' ? <SparkBars data={trend} color={color} /> : <Spark data={trend} color={color} />}
          </motion.article>
        ))}
      </section>

      <div className="admin-overview-bottom-grid">
        <motion.section className="admin-overview-panel admin-overview-trend-panel" {...riseProps(reduce, 0.26)}>
          <div className="admin-overview-panel-heading">
            <div><span className="admin-overview-section-kicker">GROWTH</span><h3>30天运营趋势</h3><p>成员注册每日变化</p></div>
            <span className="admin-overview-range-label">近 30 天</span>
          </div>
          <div className="admin-overview-trend-hero">
            {/* Grove 改版：趋势主数字用点阵数字（琥珀）。 */}
            <strong><DotDigits value={new30} size="lg" label={`近 30 天新增成员 ${new30}`} /></strong>
            <span>近 30 天新增成员</span>
          </div>
          <TrendChart data={st.dPro} />
          <div className="admin-overview-chart-labels">
            {dlabels.map(label => <span key={label}>{label}</span>)}
          </div>
        </motion.section>

        <motion.section className="admin-overview-panel admin-overview-runtime-panel" {...riseProps(reduce, 0.31)}>
          <div className="admin-overview-panel-heading">
            <div><span className="admin-overview-section-kicker">LIVE STATUS</span><h3>实时运行</h3><p>站点关键服务与最近操作</p></div>
            <span className={['admin-overview-live-status', realtimeReady ? 'is-live' : (presence?.error || realtimeFailed ? 'is-error' : 'is-waiting')].join(' ')}>
              <i aria-hidden="true" />{realtimeReady ? '实时推送' : realtimeFailed ? '备用统计' : '连接中'}
            </span>
          </div>
          <div className="admin-overview-runtime-table-wrap">
            <table className="admin-overview-runtime-table">
              <thead><tr><th>名称</th><th>最近更新</th><th>响应</th><th>状态</th></tr></thead>
              <tbody>
                <tr>
                  <td><strong>数据库连接</strong><small>Supabase</small></td>
                  <td>{new Date(st.loadedAt).toLocaleTimeString()}</td>
                  <td>{st.dbOk ? `${st.dbMs} ms` : '—'}</td>
                  <td><span className={st.dbOk ? 'is-healthy' : 'is-unhealthy'}>{st.dbOk ? '正常' : '异常'}</span></td>
                </tr>
                <tr>
                  <td><strong>在线服务</strong><small>Presence</small></td>
                  <td>{lastSample}</td>
                  <td>{sampledOnline === null ? '—' : `${sampledOnline} 人`}</td>
                  <td><span className={realtimeReady ? 'is-healthy' : realtimeFailed ? 'is-warning' : 'is-waiting'}>{realtimeReady ? '在线' : realtimeFailed ? '降级' : '连接中'}</span></td>
                </tr>
                <tr>
                  <td><strong>举报队列</strong><small>内容审核</small></td>
                  <td>{new Date(st.loadedAt).toLocaleTimeString()}</td>
                  <td>{st.pendingReports} 条</td>
                  <td><span className={st.pendingReports > 0 ? 'is-warning' : 'is-healthy'}>{st.pendingReports > 0 ? '待处理' : '正常'}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="admin-overview-runtime-logs">
            <div className="admin-overview-runtime-logs-heading"><strong>最近管理操作</strong><button type="button" onClick={() => go('logs')}>查看全部</button></div>
            {st.logsError
              ? <p className="admin-overview-empty">审计记录读取失败</p>
              : recentLogs.length
                ? recentLogs.slice(0, 2).map((log: any) => (
                  <div className="admin-overview-runtime-log" key={log.id}>
                    <span>{log.action}</span><time>{timeAgo(log.created_at)}</time>
                  </div>
                ))
                : <p className="admin-overview-empty">暂无管理操作记录</p>}
          </div>
        </motion.section>
      </div>

      <div className="admin-overview-followup-grid">
        <motion.section className="admin-overview-todo" aria-label="待处理任务" {...riseProps(reduce, 0.36)}>
          <TodoCenter go={go} />
        </motion.section>
        <motion.section className="admin-overview-panel admin-overview-recent-members" {...riseProps(reduce, 0.41)}>
          <div className="admin-overview-panel-heading">
            <div><span className="admin-overview-section-kicker">NEW MEMBERS</span><h3>最近加入</h3><p>最新注册的成员</p></div>
            <span className="admin-overview-count">{st.newMembers.length} 人</span>
          </div>
          <div className="admin-overview-list">
            {(st.newMembers as any[]).map((member: any) => (
              <div key={member.id} className="admin-overview-list-row">
                <span className="admin-overview-member-avatar">{(member.display_name || member.username || '用').slice(0, 1)}</span>
                <strong>{member.display_name || member.username}</strong>
                <time>{timeAgo(member.created_at)}</time>
              </div>
            ))}
            {st.newMembers.length === 0 && <p className="admin-overview-empty">暂时还没有新成员</p>}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
