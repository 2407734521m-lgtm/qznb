import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, timeAgo, bucket14 } from './shared';
import { Spark, TrendChart, Donut } from './charts';

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

export default function Overview({ setMsg, go }: { setMsg: (s: string) => void; go: (tab: string) => void }) {
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
    const timer = window.setInterval(() => { void refreshPresence(); }, 5 * 1000);
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
        const { count: new7 } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', week);
        const { data: logs } = await supabase.from('admin_audit_logs')
          .select('id, action, created_at').order('created_at', { ascending: false }).limit(5);
        const t0 = Date.now();
        const { error: pingErr } = await supabase.from('profiles').select('id', { head: true }).limit(1);
        const dPro = bucket14((pr.data ?? []) as any[]);
        const dPost = bucket14((por.data ?? []) as any[]);
        const dPhoto = bucket14((phr.data ?? []) as any[]);
        const dDailyPost = bucket14((pdr.data ?? []) as any[]);
        let acc = (m.count ?? 0) - dPro.reduce((a, b) => a + b, 0);
        const cum = dPro.map(v => (acc += v));
        setSt({
          members: m.count ?? 0, posts: p.count ?? 0, dailyPosts: pd.count ?? 0, comments: c.count ?? 0,
          photos: ph.count ?? 0, pendingReports: r.count ?? 0, new7: new7 ?? 0,
          newMembers: nm.data ?? [], recentLogs: logs ?? [],
          dbOk: !pingErr, dbMs: Date.now() - t0,
          dPro, dPost, dDailyPost, dPhoto, cum,
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
    { label: '日常', v: st.dailyPosts, color: '#38bdf8' },
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
          {presence?.error ? (presence.sampledAt ? '刷新失败 · 显示上次结果' : '数据暂不可用') : '自动刷新 · 5 秒'}
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

