import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { startSitePresence, type SitePresenceSnapshot } from '../../lib/sitePresence';
import { card, h3, mut, timeAgo, bucket14 } from './shared';
import AdminNumberTicker from '../../components/admin/AdminNumberTicker';
import { Spark, TrendChart } from './charts';

/* ---------------- 总览（仪表盘） ---------------- */
// 总览顶部待办中心：五个待处理队列的计数汇总在一处，点一行直达对应页签处理。
function TodoCenter({ go }: { go: (tab: string) => void }) {
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
    {counts && total === 0 && !err && <p style={{ fontSize: 13.5, color: '#2e7d4f', margin: '6px 0 2px' }}>全部处理完了，没有积压。</p>}
    {counts && items.map(([k, label, tab]) => (
      <button key={k} onClick={() => go(tab)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 2px', background: 'transparent', border: 0, borderBottom: '1px solid rgba(31,42,58,.08)', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, fontSize: 13.5, color: (counts[k] || 0) === 0 ? '#5d686f' : '#1f2a3a' }}>{label}</span>
        {(counts[k] || 0) > 0
          ? <span style={{ background: '#b0404f', color: '#fff', fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '2px 9px' }}>{counts[k]}</span>
          : <span style={{ fontSize: 12, color: '#5d686f' }}>无</span>}
        <span style={{ color: '#5d686f', fontSize: 13 }}>›</span>
      </button>
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
  return <section className="admin-overview-client-card">
    <div className="admin-overview-panel-heading">
      <div><h3>客户端分布</h3><p>依据成员最近一次客户端上报汇总</p></div>
      <button className="mini ghost" type="button" onClick={() => void load()}>刷新</button>
    </div>
    {err && <p className="admin-overview-empty">客户端统计读取失败，点刷新重试。</p>}
    {!stats && !err && <p className="admin-overview-empty">正在统计…</p>}
    {stats && (
      <>
        <div className="admin-overview-client-summary">
          <div className="admin-overview-client-gauge" style={{ '--client-ratio': `${ratio ?? 0}%` } as React.CSSProperties}>
            <div className="admin-overview-client-gauge-inner">
              <strong>{ratio === null ? '—' : `${ratio}%`}</strong>
              <span>已识别</span>
            </div>
          </div>
          <div className="admin-overview-client-total">
            <strong>{stats.total.toLocaleString('zh-CN')}</strong>
            <span>条客户端记录</span>
            <small>{identified.toLocaleString('zh-CN')} 条已识别类型</small>
          </div>
        </div>
        <div className="admin-overview-client-legend">
          {rows.map(([label, count], index) => (
            <div className="admin-overview-client-legend-row" key={label}>
              <i className={`tone-${index}`} aria-hidden="true" />
              <span>{label}</span>
              <strong>{count.toLocaleString('zh-CN')}</strong>
            </div>
          ))}
        </div>
        {stats.versions.length > 0 && (
          <p className="admin-overview-client-versions">
            版本：{stats.versions.map(v => `${v.kind === 'admin' ? '管理端' : '用户端'} ${v.version}（${v.count}）`).join(' · ')}
          </p>
        )}
      </>
    )}
  </section>;
}

export default function Overview({ setMsg, go }: { setMsg: (s: string) => void; go: (tab: string) => void }) {
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
        const since14 = new Date(Date.now() - 14 * 864e5).toISOString();
        const [m, p, c, ph, r, nm, pr, por, phr, pd, pdr] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('section', 'feed').is('deleted_at', null),
          supabase.from('comments').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('album_photos').select('id', { count: 'exact', head: true }),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('profiles').select('id, display_name, username, created_at')
            .order('created_at', { ascending: false }).limit(5),
          supabase.from('profiles').select('created_at').gte('created_at', since14),
          supabase.from('posts').select('created_at').eq('section', 'feed').gte('created_at', since14).is('deleted_at', null),
          supabase.from('album_photos').select('created_at').gte('created_at', since14),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('section', 'daily').is('deleted_at', null),
          supabase.from('posts').select('created_at').eq('section', 'daily').gte('created_at', since14).is('deleted_at', null),
        ]);
        const critical = [m, p, c, ph, r, nm, pr, por, phr, pd, pdr];
        if (critical.some(result => result.error)) throw new Error('部分核心统计读取失败，请检查权限或网络后重试。');
        const week = new Date(Date.now() - 7 * 864e5).toISOString();
        const { count: new7, error: new7Error } = await supabase.from('profiles')
          .select('id', { count: 'exact', head: true }).gte('created_at', week);
        if (new7Error) throw new Error('近 7 天新增成员统计读取失败，请重试。');
        const { data: logs, error: logsError } = await supabase.from('admin_audit_logs')
          .select('id, action, created_at').order('created_at', { ascending: false }).limit(5);
        const t0 = Date.now();
        const { error: pingErr } = await supabase.from('profiles').select('id', { head: true }).limit(1);
        const dPro = bucket14((pr.data ?? []) as any[]);
        const dPost = bucket14((por.data ?? []) as any[]);
        const dPhoto = bucket14((phr.data ?? []) as any[]);
        const dDailyPost = bucket14((pdr.data ?? []) as any[]);
        let acc = (m.count ?? 0) - dPro.reduce((a, b) => a + b, 0);
        const cum = dPro.map(v => (acc += v));
        if (!active) return;
        setSt({
          loadedAt: new Date().toISOString(),
          members: m.count ?? 0, posts: p.count ?? 0, dailyPosts: pd.count ?? 0, comments: c.count ?? 0,
          photos: ph.count ?? 0, pendingReports: r.count ?? 0, new7: new7 ?? 0,
          newMembers: nm.data ?? [], recentLogs: logs ?? [], logsError: Boolean(logsError),
          dbOk: !pingErr, dbMs: Date.now() - t0,
          dPro, dPost, dDailyPost, dPhoto, cum,
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
  const dlabels = [0, 3, 6, 10, 13].map(i => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return `${d.getMonth() + 1}-${d.getDate()}`;
  });
  const statSub: Record<string, React.ReactNode> = {
    '注册成员': <span className="admin-overview-positive">近 7 天新增 +{st.new7}</span>,
    '社区动态': st.posts === 0 ? <span>暂无新动态</span> : <span>持续更新中</span>,
    '日常帖子': st.dailyPosts === 0 ? <span>暂无日常</span> : <span>持续更新中</span>,
    '相册照片': st.photos === 0 ? <span>暂无新照片</span> : <span>持续更新中</span>,
  };
  const dashboardAccent = '#b28b3d';
  const stats: [string, number, number[], string, string][] = [
    ['注册成员', st.members, st.cum, dashboardAccent, '人'],
    ['社区动态', st.posts, st.dPost, dashboardAccent, '篇'],
    ['日常帖子', st.dailyPosts, st.dDailyPost, dashboardAccent, '篇'],
    ['相册照片', st.photos, st.dPhoto, dashboardAccent, '张'],
  ];
  const recentLogs = (st.recentLogs as any[]).slice(0, 4);
  const sampledOnline = presence && presence.sampledAt ? presence.online : null;
  const lastSample = presence?.sampledAt ? new Date(presence.sampledAt).toLocaleTimeString() : '等待首次采样';
  return (
    <div className="admin-overview-dashboard admin-overview-reference-layout">
      <header className="admin-overview-welcome">
        <div className="admin-overview-welcome-copy">
          <span className="admin-overview-eyebrow">ADMIN WORKSPACE · CONTROL CENTER</span>
          <h2>欢迎回来，管理员</h2>
          <p>这里汇总站点运行、成员增长与待处理工作。</p>
          <div className="admin-overview-welcome-meta">
            <span>{new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</span>
            <span>数据更新于 {new Date(st.loadedAt).toLocaleTimeString()}</span>
          </div>
          <div className="admin-overview-welcome-actions">
            <button type="button" className="is-primary" onClick={() => go('board')}>发布公告</button>
            <button type="button" onClick={() => go('accounts')}>成员管理</button>
            <button type="button" className="is-quiet" onClick={() => {
              setSt(null);
              setLoadTimedOut(false);
              setRefreshSeq(value => value + 1);
            }}>刷新数据</button>
          </div>
        </div>
        <aside className="admin-overview-welcome-status" aria-label="站点运行状态">
          <div className="admin-overview-welcome-status-heading">
            <span>系统运行</span>
            <strong className={st.dbOk ? 'is-healthy' : 'is-unhealthy'}>
              <i aria-hidden="true" />{st.dbOk ? '运行正常' : '连接异常'}
            </strong>
          </div>
          <div className="admin-overview-welcome-status-grid">
            <div>
              <span>当前在线</span>
              <strong>{sampledOnline === null ? '—' : sampledOnline}</strong>
              <small>{realtimeReady ? '实时连接' : realtimeFailed ? '备用统计' : '等待连接'}</small>
            </div>
            <div>
              <span>数据库延迟</span>
              <strong>{st.dbOk ? `${st.dbMs} ms` : '异常'}</strong>
              <small>最近一次连通性检测</small>
            </div>
          </div>
          <div className="admin-overview-welcome-status-foot">
            <span>在线数据最近更新</span><strong>{lastSample}</strong>
          </div>
        </aside>
      </header>

      <div className="admin-overview-start-grid">
        <section className="admin-overview-guide-panel">
          <div className="admin-overview-guide-heading">
            <div><span className="admin-overview-section-kicker">QUICK START</span><h3>入门指南</h3></div>
            <span>常用管理入口</span>
          </div>
          <div className="admin-overview-guide-list">
            <button type="button" onClick={() => go('accounts')}>
              <span className="admin-overview-guide-index">01</span>
              <span className="admin-overview-guide-copy"><strong>成员与权限</strong><small>查看成员账号、角色及状态</small></span>
              <span className="admin-overview-guide-arrow">↗</span>
            </button>
            <button type="button" onClick={() => go('moderate')}>
              <span className="admin-overview-guide-index">02</span>
              <span className="admin-overview-guide-copy"><strong>内容审核</strong><small>处理举报与待审核内容</small></span>
              <span className="admin-overview-guide-arrow">↗</span>
            </button>
            <button type="button" onClick={() => go('board')}>
              <span className="admin-overview-guide-index">03</span>
              <span className="admin-overview-guide-copy"><strong>发布公告</strong><small>更新站点公告与通知</small></span>
              <span className="admin-overview-guide-arrow">↗</span>
            </button>
            <button type="button" onClick={() => go('appCenter')}>
              <span className="admin-overview-guide-index">04</span>
              <span className="admin-overview-guide-copy"><strong>应用管理</strong><small>查看软件版本和更新说明</small></span>
              <span className="admin-overview-guide-arrow">↗</span>
            </button>
          </div>
        </section>
        <ClientStatsCard />
      </div>

      <section className="admin-overview-primary-grid" aria-label="核心数据">
        {stats.map(([label, value, trend, color, unit], index) => (
          <article key={label} className="admin-overview-metric-card">
            <div className="admin-overview-metric-topline">
              <span className="admin-overview-metric-label">{label}</span>
              <span className={`admin-overview-metric-icon tone-${index}`}>{['人', '动', '日', '图'][index]}</span>
            </div>
            <div className="admin-overview-metric-value"><AdminNumberTicker value={value} /><small>{unit}</small></div>
            <div className="admin-overview-metric-hint">{statSub[label]}</div>
            <Spark data={trend} color={color} />
          </article>
        ))}
      </section>

      <div className="admin-overview-bottom-grid">
        <section className="admin-overview-panel admin-overview-trend-panel">
          <div className="admin-overview-panel-heading">
            <div><span className="admin-overview-section-kicker">GROWTH</span><h3>近 14 天增长趋势</h3><p>成员注册每日变化</p></div>
            <span className="admin-overview-range-label">近 14 天</span>
          </div>
          <TrendChart data={st.dPro} />
          <div className="admin-overview-chart-labels">
            {dlabels.map(label => <span key={label}>{label}</span>)}
          </div>
        </section>

        <section className="admin-overview-panel admin-overview-runtime-panel">
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
                  <td><span className={realtimeReady ? 'is-healthy' : realtimeFailed ? 'is-warning' : ''}>{realtimeReady ? '在线' : realtimeFailed ? '降级' : '连接中'}</span></td>
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
        </section>
      </div>

      <div className="admin-overview-followup-grid">
        <section className="admin-overview-todo" aria-label="待处理任务">
          <TodoCenter go={go} />
        </section>
        <section className="admin-overview-panel admin-overview-recent-members">
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
        </section>
      </div>
    </div>
  );
}
