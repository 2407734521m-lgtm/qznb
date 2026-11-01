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
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const queries = [
      supabase.from('love_wall_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('song_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('game_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('feedbacks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ];
    const res = await Promise.all(queries);
    if (res.some(r => r.error)) { setCounts(null); setErr(true); setLoading(false); return; }
    setErr(false);
    setCounts({ love: res[0].count ?? 0, song: res[1].count ?? 0, game: res[2].count ?? 0, report: res[3].count ?? 0, feedback: res[4].count ?? 0 });
    setLoading(false);
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
      <button className="mini ghost" disabled={loading} onClick={() => void load()}>{loading ? '刷新中…' : '刷新'}</button>
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

export default function Overview({ go }: { setMsg: (s: string) => void; go: (tab: string) => void }) {
  const [st, setSt] = useState<any>(null);
  const [presence, setPresence] = useState<{ online: number; active: number; sampledAt: string; error: boolean } | null>(null);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [realtimeFailed, setRealtimeFailed] = useState(false);
  const realtimeRef = useRef<SitePresenceSnapshot>({
    status: 'connecting', online: null, updatedAt: null,
  });
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
        const live = realtimeRef.current;
        setPresence(prev => ({
          online: live.status === 'connected' && live.online !== null
            ? live.online
            : Number(data.online_count ?? 0),
          active: Number(data.active_count ?? 0),
          sampledAt: live.status === 'connected'
            ? (live.updatedAt ?? prev?.sampledAt ?? data.sampled_at ?? new Date().toISOString())
            : (data.sampled_at ?? new Date().toISOString()),
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
        const week = new Date(Date.now() - 7 * 864e5).toISOString();
        const { count: new7, error: new7Error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', week);
        const { data: logs, error: logsError } = await supabase.from('admin_audit_logs')
          .select('id, action, created_at').order('created_at', { ascending: false }).limit(5);
        const dataErrors = [m, p, c, ph, r, nm, pr, por, phr, pd, pdr].filter(result => result.error);
        if (dataErrors.length || new7Error || logsError) {
          const firstError = dataErrors[0]?.error ?? new7Error ?? logsError;
          throw new Error(firstError?.message || '部分统计数据读取失败');
        }
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
          newMembers: nm.data ?? [], recentLogs: logs ?? [],
          dbOk: !pingErr, dbMs: Date.now() - t0,
          dPro, dPost, dDailyPost, dPhoto, cum,
        });
      } catch (e: unknown) {
        if (active) setLoadError(e instanceof Error ? e.message : '请检查网络或管理员数据权限后重试。');
      }
    })();
    return () => { active = false; };
  }, [refreshSeq]);
  useEffect(() => {
    if (st || loadError) return;
    const timer = window.setTimeout(() => setLoadTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, [st, loadError, refreshSeq]);
  if (loadError) return <div className="admin-overview-timeout" role="alert"><strong>部分总览数据读取失败</strong><p>{loadError}</p><p>为避免把读取失败误报成 0，本次不会展示不完整统计。</p><button type="button" onClick={() => { setLoadError(null); setLoadTimedOut(false); setRefreshSeq(value => value + 1); }}>重新加载</button></div>;
  if (!st && !loadTimedOut) return <div className="admin-overview-loading" role="status"><span className="admin-loading-pulse" />正在整理总览数据…</div>;
  if (!st) return <div className="admin-overview-timeout"><strong>总览数据暂时没有响应</strong><p>后台其他功能仍可使用。请检查网络后重试。</p><button type="button" onClick={() => { setLoadError(null); setLoadTimedOut(false); setRefreshSeq(value => value + 1); }}>重新加载</button></div>;
  const segs = [
    { label: '成员', v: st.members, color: '#5b8cff' },
    { label: '动态', v: st.posts, color: '#8b5cf6' },
    { label: '日常', v: st.dailyPosts, color: '#38bdf8' },
    { label: '照片', v: st.photos, color: '#4ade80' },
    { label: '评论', v: st.comments, color: '#f5a623' },
  ];
  const dlabels = [0, 3, 6, 10, 13].map(i => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return `${d.getMonth() + 1}-${d.getDate()}`;
  });
  const statSub: Record<string, React.ReactNode> = {
    '注册成员': <span style={{ color: '#4ade80' }}>较7天前 +{st.new7}</span>,
    '近7天新增': <span style={{ color: '#4ade80' }}>新增注册</span>,
    '班级动态': st.posts === 0 ? <span style={{ color: '#8b93b0' }}>暂无新动态</span> : <span style={{ color: '#4ade80' }}>持续更新中</span>,
    '日常帖子': st.dailyPosts === 0 ? <span style={{ color: '#8b93b0' }}>暂无日常</span> : <span style={{ color: '#4ade80' }}>持续更新中</span>,
    '班级照片': st.photos === 0 ? <span style={{ color: '#8b93b0' }}>暂无新照片</span> : <span style={{ color: '#4ade80' }}>持续更新中</span>,
  };
  const stats: [string, number, number[], string][] = [
    ['注册成员', st.members, st.cum, '#5b8cff'],
    ['近7天新增', st.new7, st.dPro.slice(-7), '#8b5cf6'],
    ['班级动态', st.posts, st.dPost, '#4ade80'],
    ['日常帖子', st.dailyPosts, st.dDailyPost, '#38bdf8'],
    ['班级照片', st.photos, st.dPhoto, '#f5a623'],
  ];
  return (
    <div className="admin-overview-dashboard">
      <header className="admin-overview-header">
        <div>
          <h2>运营总览</h2>
          <p>数据更新于 {new Date(st.loadedAt).toLocaleString()}</p>
        </div>
        <button className="mini ghost" type="button" onClick={() => {
          setSt(null);
          setLoadError(null);
          setLoadTimedOut(false);
          setRefreshSeq(value => value + 1);
        }}>刷新数据</button>
      </header>

      <section className="admin-overview-todo" aria-label="待处理任务">
        <TodoCenter go={go} />
      </section>

      <nav className="admin-overview-shortcuts" aria-label="常用管理入口">
        <button type="button" onClick={() => go('board')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 19V5h14v14H5Z"/><path d="M8 9h8M8 13h5M8 17h8"/></svg>
          <span><strong>发布公告</strong><small>更新首页与社区公告</small></span>
        </button>
        <button type="button" onClick={() => go('notifications')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>
          <span><strong>发送通知</strong><small>向成员发送站内消息</small></span>
        </button>
        <button type="button" onClick={() => go('feedback')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 13h5"/></svg>
          <span><strong>查看反馈</strong><small>跟进建议与问题报告</small></span>
        </button>
      </nav>

      <section className="admin-overview-primary-grid" aria-label="核心数据">
        {stats.map(([k, v, d, col]) => (
          <article key={k} className="admin-overview-metric-card" style={card}>
            <div className="admin-overview-metric-label">{k}</div>
            <div className="admin-overview-metric-value"><AdminNumberTicker value={v} /></div>
            <div className="admin-overview-metric-hint">{statSub[k]}</div>
            <Spark data={d} color={col} />
          </article>
        ))}
      </section>

      <div className="admin-overview-insights-grid">
        <section className="admin-overview-panel admin-overview-trend-panel" style={card}>
          <div className="admin-overview-panel-heading">
            <div><h3>近 14 天注册趋势</h3><p>每日新增成员数量</p></div>
            <span className="admin-overview-range-label">近 14 天</span>
          </div>
          <TrendChart data={st.dPro} />
          <div className="admin-overview-chart-labels">
            {dlabels.map(l => <span key={l}>{l}</span>)}
          </div>
        </section>

        <section className="admin-overview-panel admin-overview-mix-panel" style={card}>
          <div className="admin-overview-panel-heading">
            <div><h3>数据规模概览</h3><p>各类记录数量分别展示，不进行跨类别占比比较</p></div>
          </div>
          <div className="admin-overview-mix-content admin-overview-data-list">
            <div className="admin-overview-mix-legend" role="list">
              {segs.map(s => (
                <div key={s.label} role="listitem">
                  <span className="admin-overview-legend-dot" style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <strong>{s.v.toLocaleString()}</strong>
                  <small>条 / 人</small>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="admin-overview-activity-grid">
        <section className="admin-overview-panel" style={card}>
          <div className="admin-overview-panel-heading">
            <div><h3>最近管理操作</h3><p>后台最近写入的审计记录</p></div>
            <span className="admin-overview-count">{st.recentLogs.length} 条</span>
          </div>
          <div className="admin-overview-list">
            {(st.recentLogs as any[]).map((l: any) => (
              <div key={l.id} className="admin-overview-list-row">
                <span className="admin-overview-list-marker" />
                <strong>{l.action}</strong>
                <time>{(l.created_at || '').slice(5, 16).replace('T', ' ')}</time>
              </div>
            ))}
            {st.recentLogs.length === 0 && <p className="admin-overview-empty">暂无管理操作记录</p>}
          </div>
        </section>

        <section className="admin-overview-panel" style={card}>
          <div className="admin-overview-panel-heading">
            <div><h3>最近加入</h3><p>最新注册的成员</p></div>
            <span className="admin-overview-count">{st.newMembers.length} 人</span>
          </div>
          <div className="admin-overview-list">
            {(st.newMembers as any[]).map((m: any) => (
              <div key={m.id} className="admin-overview-list-row">
                <span className="admin-overview-member-avatar">{(m.display_name || m.username || '用').slice(0, 1)}</span>
                <strong>{m.display_name || m.username}</strong>
                <time>{timeAgo(m.created_at)}</time>
              </div>
            ))}
            {st.newMembers.length === 0 && <p className="admin-overview-empty">暂时还没有新成员</p>}
          </div>
        </section>
      </div>

      <div className="admin-overview-health-grid">
        <section className="admin-overview-panel admin-overview-online-panel" style={card}>
          <div className="admin-overview-panel-heading">
            <div><h3>在线统计</h3><p>只展示聚合人数，不展示成员身份</p></div>
            <span className={['admin-overview-live-status', realtimeReady ? 'is-live' : (presence?.error || realtimeFailed ? 'is-error' : 'is-waiting')].join(' ')}>
              <i aria-hidden="true" />
              {realtimeReady ? '实时推送' : realtimeFailed ? '活动统计回退' : presence?.error ? '刷新失败' : '连接中'}
            </span>
          </div>
          <div className="admin-overview-online-metrics">
            <div>
              <span>{realtimeReady ? '实时在线连接（已登录）' : '近 5 分钟活跃账号'}</span>
              <strong>{presence && presence.sampledAt ? presence.online : '—'}</strong>
              <small>{realtimeReady ? '连接变化即时推送' : '5 分钟内有活动即计入'}</small>
            </div>
            <div>
              <span>近 30 分钟活跃账号</span>
              <strong>{presence && presence.sampledAt ? presence.active : '—'}</strong>
              <small>30 分钟内有活动即计入</small>
            </div>
          </div>
          <p className="admin-overview-privacy-note">
            {realtimeReady
              ? '实时模式只发布匿名在线标记，不传递账号 ID、昵称或邮箱；同一账号的多个标签页或设备会分别计数。'
              : '备用模式由服务器按活动窗口统计账号：近 5 分钟有活动计入在线，超过窗口后自动移出；同一账号去重。'}
            {presence?.sampledAt ? ` 最近更新：${new Date(presence.sampledAt).toLocaleTimeString()}` : ' 等待首次采样…'}
          </p>
        </section>

        <section className="admin-overview-panel admin-overview-system-panel" style={card}>
          <div className="admin-overview-panel-heading">
            <div><h3>系统状态</h3><p>基础服务连通性</p></div>
          </div>
          <div className="admin-overview-system-row">
            <span>数据库连接</span>
            {st.dbOk
              ? <strong className="is-healthy">正常 · {st.dbMs} ms</strong>
              : <strong className="is-unhealthy">连接异常</strong>}
          </div>
          <div className="admin-overview-system-row">
            <span>待处理举报</span>
            <strong className={st.pendingReports > 0 ? 'is-warning' : 'is-healthy'}>{st.pendingReports} 条</strong>
          </div>
        </section>
      </div>
    </div>
  );
}

