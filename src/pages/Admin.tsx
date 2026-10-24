import { useEffect, useState } from 'react';
import AdminMemberModal from '../components/AdminMemberModal';
import { supabase, supabaseBaseUrl } from '../lib/supabase';
import { useAuth } from '../auth';

/**
 * 管理后台测试版（V2）：高级管理控制中心
 * 通过 #/admin-v2 进入，不影响现有 /admin
 * 设计：深色玻璃拟态，文字按钮无 emoji，手机优先
 */

type Member = {
  id: string; username: string; display_name: string | null; real_name: string | null;
  role: string; joined: boolean; created_at: string;
};
type Post = { id: number; author_id: string; content: string; image_url: string | null; created_at: string; deleted_at: string | null };
type Cmt = { id: number; post_id: number; author_id: string; content: string; created_at: string; deleted_at: string | null };
type Report = {
  id: number; reporter_id: string | null; target_type: string; target_id: string;
  reason: string; status: string; handle_note: string | null; created_at: string;
};
type Log = { id: number; action: string; detail: unknown; created_at: string };

const TABS_ALL: [string, string, boolean][] = [
  ['overview', '总览', false],
  ['members', '成员', false],
  ['invite', '邀请码', false],
  ['moderate', '审核', false],
  ['feedback', '反馈', false],
  ['game', '段位', false],
  ['board', '公告', false],
  ['events', '活动', false],
  ['logs', '日志', false],
  ['settings', '设置', true], // 仅超管
  ['test', '测试', true], // 仅超管
];

const card: React.CSSProperties = {
  background: 'linear-gradient(160deg,#131a30,#0e1428)',
  border: '1px solid #ffffff12', borderRadius: 14, padding: 14, marginBottom: 12,
  boxShadow: '0 8px 32px #0008',
};
const h3: React.CSSProperties = { margin: '0 0 10px', fontSize: 15, fontWeight: 700 };
const mut: React.CSSProperties = { color: 'var(--mut)', fontSize: 12.5 };
const rowBtn: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 };

/* ---------- 仪表盘图表组件 ---------- */
function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 100, h = 30;
  const vs = data.length > 1 ? data : [0, data[0] ?? 0];
  const max = Math.max(...vs, 1);
  const line = 'M' + vs.map((v, i) => `${((i / (vs.length - 1)) * w).toFixed(1)},${(h - 4 - (v / max) * (h - 10)).toFixed(1)}`).join(' L');
  const gid = 'sp' + color.replace(/[^0-9a-f]/gi, '');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 26, marginTop: 4, display: 'block' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity=".4" />
        <stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
function TrendChart({ data }: { data: number[] }) {
  const w = 300, h = 90;
  const max = Math.max(...data, 1);
  const line = 'M' + data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 8 - (v / max) * (h - 20)).toFixed(1)}`).join(' L');
  const ly = h - 8 - (data[data.length - 1] / max) * (h - 20);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 90, display: 'block' }}>
      <defs><linearGradient id="dtrend" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5b8cff" stopOpacity=".45" />
        <stop offset="1" stopColor="#5b8cff" stopOpacity="0" />
      </linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#dtrend)" />
      <path d={line} fill="none" stroke="#5b8cff" strokeWidth="2.5" />
      <circle cx={w} cy={ly} r="7" fill="#5b8cff33" />
      <circle cx={w} cy={ly} r="4" fill="#5b8cff" />
    </svg>
  );
}
function Donut({ segs }: { segs: { label: string; v: number; color: string }[] }) {
  const C = 2 * Math.PI * 38;
  const tot = segs.reduce((a, s) => a + s.v, 0) || 1;
  let off = 0;
  const arcs = segs.map(s => {
    const len = (s.v / tot) * C;
    const el = (
      <circle key={s.label} cx="50" cy="50" r="38" fill="none" stroke={s.color}
        strokeWidth="16" strokeDasharray={`${Math.max(len - 2.5, 0.1)} ${C}`}
        strokeDashoffset={-off} strokeLinecap="round" transform="rotate(-90 50 50)" />
    );
    off += len;
    return el;
  });
  return (
    <svg viewBox="0 0 100 100" style={{ width: 96, height: 96, flex: '0 0 auto' }}>
      <circle cx="50" cy="50" r="38" fill="none" stroke="#232b45" strokeWidth="16" />
      {arcs}
      <text x="50" y="56" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="800">{tot}</text>
    </svg>
  );
}
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

async function alog(action: string, detail: any) {
  try { await supabase.rpc('log_admin_action', { p_action: action, p_detail: JSON.stringify(detail) }); } catch {}
}

function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(s).toLocaleDateString();
}

export default function Admin() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
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
    supabase.rpc('my_role').then(({ data, error }) => {
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
    setTab(id); setMsg('');
    window.scrollTo({ top: 0 });
  }

  if (!session || verifiedUid !== session.user.id || !role) {
    return <div className="center" style={{ minHeight: '60vh' }}>正在验证管理员权限…</div>;
  }
  if (role !== 'admin' && role !== 'super_admin') {
    return (
      <div className="center" style={{ minHeight: '60vh', padding: 24, textAlign: 'center' }}>
        <p>管理员权限验证失败，后台内容已锁定。</p>
        <button onClick={() => supabase.auth.signOut()}>退出登录</button>
      </div>
    );
  }

  return (
    <div className="page" style={{
      background: '#0a0f1e', minHeight: '100vh',
      margin: '-14px calc(-14px - env(safe-area-inset-right)) 0 calc(-14px - env(safe-area-inset-left))',
      padding: '14px 14px 110px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg,#5b8cff,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16, color: '#fff',
          }}>管</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>管理控制中心</div>
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

      <form onSubmit={e => { e.preventDefault(); switchTab('members'); }} style={{ marginBottom: 12 }}>
        <input value={q0} onChange={e => setQ0(e.target.value)} placeholder="搜索成员姓名 / 用户名…"
          style={{
            width: '100%', boxSizing: 'border-box', background: '#ffffff0d',
            border: '1px solid #ffffff14', borderRadius: 10, padding: '9px 12px',
            color: '#fff', fontSize: 13, outline: 'none',
          }} />
      </form>

      {msg && <p className="priv-note" style={{ margin: '0 0 10px' }}>{msg}</p>}

      {tab === 'overview' && <Overview setMsg={setMsg} />}
      {tab === 'members' && <Members me={me} isSuper={isSuper} setMsg={setMsg} extQ={q0} />}
      {tab === 'moderate' && <Moderate setMsg={setMsg} />}
      {tab === 'board' && <BoardMgr me={me} setMsg={setMsg} />}
      {tab === 'events' && <EventTab me={me} setMsg={setMsg} />}
      {tab === 'logs' && <Logs />}
      {tab === 'settings' && isSuper && <Settings me={me} setMsg={setMsg} />}
      {tab === 'invite' && <InviteTab isSuper={isSuper} setMsg={setMsg} />}
      {tab === 'feedback' && <FeedbackTab me={me} isSuper={isSuper} setMsg={setMsg} />}
      {tab === 'game' && <GameTab setMsg={setMsg} />}
      {tab === 'test' && isSuper && <TestTab setMsg={setMsg} />}

      {/* 底部 dock */}
      <div style={{
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
            <button key={id} onClick={() => switchTab(id)} style={{
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
function Overview({ setMsg }: { setMsg: (s: string) => void }) {
  const [st, setSt] = useState<any>(null);
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
  if (!st) return <div className="center">加载中…</div>;
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
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
      const { error } = await supabase.rpc('set_joined', { target: id, joined });
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
function Moderate({ setMsg }: { setMsg: (s: string) => void }) {
  const [sub, setSub] = useState<'posts' | 'comments' | 'reports'>('reports');
  const [posts, setPosts] = useState<Post[]>([]);
  const [cmts, setCmts] = useState<Cmt[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  async function load() {
    const [p, c, r] = await Promise.all([
      supabase.from('posts').select('id, author_id, content, image_url, created_at, deleted_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('comments').select('id, post_id, author_id, content, created_at, deleted_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setPosts((p.data ?? []) as Post[]); setCmts((c.data ?? []) as Cmt[]); setReports((r.data ?? []) as Report[]);
    const ids = new Set<string>();
    (p.data ?? []).forEach((x: any) => ids.add(x.author_id));
    (c.data ?? []).forEach((x: any) => ids.add(x.author_id));
    if (ids.size) {
      const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 200, skip: 0 });
      const mp: Record<string, string> = {};
      ((dir ?? []) as any[]).forEach((x: any) => { mp[x.id] = x.display_name ?? x.username; });
      setNames(mp);
    }
  }
  useEffect(() => { load(); }, []);

  async function hidePost(p: Post, hide: boolean) {
    if (!confirm(hide ? '隐藏这条动态？（进回收站，可恢复）' : '恢复这条动态？')) return;
    const { error } = await supabase.from('posts').update({ deleted_at: hide ? new Date().toISOString() : null }).eq('id', p.id);
    if (!error) { await alog(hide ? 'post_hide' : 'post_restore', { id: p.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function delPost(p: Post) {
    if (!confirm('彻底删除这条动态？不可恢复！')) return;
    if (!confirm('再次确认：真的彻底删除吗？')) return;
    const { error } = await supabase.from('posts').delete().eq('id', p.id);
    if (!error) { await alog('post_delete', { id: p.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function hideCmt(c: Cmt, hide: boolean) {
    if (!confirm(hide ? '隐藏这条评论？' : '恢复这条评论？')) return;
    const { error } = await supabase.from('comments').update({ deleted_at: hide ? new Date().toISOString() : null }).eq('id', c.id);
    if (!error) { await alog(hide ? 'comment_hide' : 'comment_restore', { id: c.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function handleReport(r: Report, ok: boolean) {
    const note = ok ? '' : (prompt('驳回原因（可选）：') ?? '');
    if (!ok && note === null) return;
    const { error } = await supabase.from('reports').update({
      status: ok ? 'done' : 'rejected', handle_note: note || null, handled_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (!error) { await alog('report_handle', { id: r.id, result: ok ? 'done' : 'rejected', note }); load(); setMsg('已处理'); }
    else setMsg('失败：' + error.message);
  }

  const pending = reports.filter(r => r.status === 'pending').length;
  return (<>
    <div className="row" style={{ gap: 6, marginBottom: 12 }}>
      <button className={'mini' + (sub === 'reports' ? '' : ' ghost')} onClick={() => setSub('reports')}>举报{pending ? `（${pending}）` : ''}</button>
      <button className={'mini' + (sub === 'posts' ? '' : ' ghost')} onClick={() => setSub('posts')}>动态</button>
      <button className={'mini' + (sub === 'comments' ? '' : ' ghost')} onClick={() => setSub('comments')}>评论</button>
    </div>

    {sub === 'reports' && (<>
      {reports.length === 0 && <div style={card}><p style={mut}>暂无举报</p></div>}
      {reports.map(r => (
        <div key={r.id} style={{ ...card, opacity: r.status === 'pending' ? 1 : 0.6 }}>
          <div style={{ fontSize: 13.5 }}>
            <b>{r.target_type}</b> #{r.target_id} · {r.status === 'pending' ? '待处理' : r.status === 'done' ? '已处理' : '已驳回'}
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>原因：{r.reason}</div>
          {r.handle_note && <div style={mut}>处理备注：{r.handle_note}</div>}
          <div style={mut}>{timeAgo(r.created_at)}</div>
          {r.status === 'pending' && (
            <div style={rowBtn}>
              <button className="mini" onClick={() => handleReport(r, true)}>已处理</button>
              <button className="mini ghost" onClick={() => handleReport(r, false)}>驳回</button>
            </div>
          )}
        </div>
      ))}
    </>)}

    {sub === 'posts' && (<>
      {posts.map(p => (
        <div key={p.id} style={{ ...card, opacity: p.deleted_at ? 0.55 : 1 }}>
          <div style={{ fontSize: 13.5 }}>{(p.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[p.author_id] || '…'} · {timeAgo(p.created_at)}{p.deleted_at ? ' · 已隐藏' : ''}</div>
          <div style={rowBtn}>
            {p.deleted_at
              ? <button className="mini" onClick={() => hidePost(p, false)}>恢复</button>
              : <button className="mini ghost" onClick={() => hidePost(p, true)}>隐藏</button>}
            <button className="mini danger" onClick={() => delPost(p)}>彻底删除</button>
          </div>
        </div>
      ))}
      {posts.length === 0 && <div style={card}><p style={mut}>暂无动态</p></div>}
    </>)}

    {sub === 'comments' && (<>
      {cmts.map(c => (
        <div key={c.id} style={{ ...card, opacity: c.deleted_at ? 0.55 : 1 }}>
          <div style={{ fontSize: 13.5 }}>{(c.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[c.author_id] || '…'} · 动态 #{c.post_id} · {timeAgo(c.created_at)}{c.deleted_at ? ' · 已隐藏' : ''}</div>
          <div style={rowBtn}>
            {c.deleted_at
              ? <button className="mini" onClick={() => hideCmt(c, false)}>恢复</button>
              : <button className="mini ghost" onClick={() => hideCmt(c, true)}>隐藏</button>}
          </div>
        </div>
      ))}
      {cmts.length === 0 && <div style={card}><p style={mut}>暂无评论</p></div>}
    </>)}
  </>);
}

/* ---------------- 公告管理 ---------------- */
function BoardMgr({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [exp, setExp] = useState('0');
  const [popupTimes, setPopupTimes] = useState('1');
  const [list, setList] = useState<any[]>([]);
  const POP_CYCLE = ['0', '1', '2', '3', '999'];
  const popLabel = (v: any) => ({ '0': '关', '1': '1次', '2': '2次', '3': '3次', '999': '每次' } as any)[String(v ?? '0')] ?? '关';
  async function load() {
    const { data } = await supabase.from('board_messages')
      .select('id, title, content, is_pinned, popup_on_login, popup_times, expires_at, created_at').eq('is_admin_msg', true)
      .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20);
    setList(data ?? []);
  }
  useEffect(() => { load(); }, []);
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
function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase.from('admin_audit_logs').select('id, action, detail, created_at')
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setLogs((data ?? []) as Log[]));
  }, []);
  const shown = logs.filter(l => !q || l.action.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={card}>
      <h3 style={h3}>操作日志（{shown.length}）</h3>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="筛选，如：member_ban" style={{ marginBottom: 10 }} />
      {shown.map(l => (
        <div key={l.id} style={{ fontSize: 12.5, padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
          <span style={mut}>{(l.created_at || '').slice(0, 16).replace('T', ' ')}</span>
          <div><b>{l.action}</b></div>
          <div style={mut}>{JSON.stringify(l.detail ?? {}).slice(0, 200)}</div>
        </div>
      ))}
      {shown.length === 0 && <p style={mut}>暂无记录</p>}
      <p style={{ ...mut, marginTop: 10 }}>日志仅管理员可见，不可删除或修改。</p>
    </div>
  );
}

/* ---------------- 系统设置（仅超管） ---------------- */
function Settings({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from('site_settings').select('key, value');
    const o: Record<string, string> = {};
    (data ?? []).forEach((x: any) => { o[x.key] = x.value; });
    setVals(o);
    const { data: bl } = await supabase.from('backup_logs').select('*').order('created_at', { ascending: false }).limit(10);
    setBackups(bl ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save(key: string, value: string) {
    const { error } = await supabase.from('site_settings').upsert({ key, value }, { onConflict: 'key' });
    if (!error) { await alog('setting_change', { key, value }); setMsg('已保存'); load(); }
    else setMsg('保存失败：' + error.message);
  }

  async function checkHealth() {
    const r: any = {};
    try { const t0 = Date.now(); const { error } = await supabase.from('profiles').select('id', { head: true }).limit(1); r.db = error ? '异常' : `正常（${Date.now() - t0}ms）`; }
    catch { r.db = '异常'; }
    try { const { data } = await supabase.storage.listBuckets(); r.storage = (data ?? []).map((b: any) => b.name).join('、') || '无'; }
    catch { r.storage = '异常'; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${supabaseBaseUrl}/functions/v1/notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': 'sb_publishable_4dNtXkAYz6Q2KE0hZdZyKw_vF7b9T5q' }, body: '{}',
      });
      r.notify = resp.status === 401 ? '正常' : `异常（${resp.status}）`;
    } catch { r.notify = '异常'; }
    setHealth(r);
    await alog('health_check', r);
  }

  async function backup() {
    if (!confirm('导出全站数据备份？文件会直接下载到本机，不经过公开链接。')) return;
    setMsg('正在备份…');
    try {
      const [p, po, cm, al, ap, bm, fb] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, real_name, role, joined, created_at, age, personality, signature, bio, hobbies'),
        supabase.from('posts').select('*').limit(2000),
        supabase.from('comments').select('*').limit(5000),
        supabase.from('albums').select('*').limit(500),
        supabase.from('album_photos').select('id, album_id, photo_url, caption, created_at').limit(5000),
        supabase.from('board_messages').select('*').limit(2000),
        supabase.from('feedbacks').select('*').limit(2000),
      ]);
      const data = {
        backup_at: new Date().toISOString(), scope: 'full',
        profiles: p.data ?? [], posts: po.data ?? [], comments: cm.data ?? [],
        albums: al.data ?? [], album_photos: ap.data ?? [], board: bm.data ?? [], feedbacks: fb.data ?? [],
      };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `班级备份_${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(a.href);
      await supabase.from('backup_logs').insert({ created_by: me, scope: 'full', status: 'ok', note: `成员${(p.data ?? []).length} 动态${(po.data ?? []).length}` });
      await alog('backup', { scope: 'full' });
      setMsg('备份完成，文件已下载'); load();
    } catch (e: any) {
      setMsg('备份失败：' + (e.message || ''));
      try { await supabase.from('backup_logs').insert({ created_by: me, scope: 'full', status: 'fail', note: e.message || '' }); } catch {}
    }
  }

  return (<>
    <div style={card}>
      <h3 style={h3}>全站设置</h3>
      <label style={mut}>网站标题</label>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input value={vals.site_title ?? ''} onChange={e => setVals({ ...vals, site_title: e.target.value })} style={{ flex: 1 }} />
        <button className="mini" onClick={() => save('site_title', vals.site_title ?? '')}>保存</button>
      </div>
      <label style={mut}>副标题</label>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input value={vals.site_subtitle ?? ''} onChange={e => setVals({ ...vals, site_subtitle: e.target.value })} style={{ flex: 1 }} />
        <button className="mini" onClick={() => save('site_subtitle', vals.site_subtitle ?? '')}>保存</button>
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13.5 }}>注册强制邀请码</span>
        <button className={'mini' + (vals.require_invite === 'true' ? '' : ' ghost')}
          onClick={() => save('require_invite', vals.require_invite === 'true' ? 'false' : 'true')}>
          {vals.require_invite === 'true' ? '开' : '关'}
        </button>
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13.5 }}>维护模式</span>
        <button className={'mini' + (vals.maintenance === 'true' ? '' : ' ghost')}
          onClick={() => {
            if (vals.maintenance !== 'true' && !confirm('开启维护模式？普通成员将看到维护提示。')) return;
            save('maintenance', vals.maintenance === 'true' ? 'false' : 'true');
          }}>
          {vals.maintenance === 'true' ? '开' : '关'}
        </button>
      </div>
      {vals.maintenance === 'true' && (<>
        <label style={{ ...mut, marginTop: 8 }}>维护提示语</label>
        <div className="row" style={{ gap: 8 }}>
          <input value={vals.maintenance_msg ?? ''} onChange={e => setVals({ ...vals, maintenance_msg: e.target.value })} style={{ flex: 1 }} />
          <button className="mini" onClick={() => save('maintenance_msg', vals.maintenance_msg ?? '')}>保存</button>
        </div>
      </>)}
    </div>

    <div style={card}>
      <h3 style={h3}>健康检查</h3>
      <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={checkHealth}>开始检查</button>
      {health && (
        <div style={{ fontSize: 13.5, lineHeight: 2, marginTop: 8 }}>
          <div>数据库：{health.db}</div>
          <div>存储桶：{health.storage}</div>
          <div>邮件函数：{health.notify}</div>
        </div>
      )}
    </div>

    <div style={card}>
      <h3 style={h3}>备份</h3>
      <p style={mut}>备份文件直接下载到本机，不生成公开链接。恢复前请先确认，避免覆盖新数据。</p>
      <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={backup}>一键备份</button>
      <div style={{ marginTop: 10 }}>
        {backups.map(b => (
          <div key={b.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid #ffffff0c' }}>
            {(b.created_at || '').slice(0, 16).replace('T', ' ')} · {b.scope} · {b.status === 'ok' ? '成功' : '失败'}
            {b.note ? ` · ${b.note}` : ''}
          </div>
        ))}
        {backups.length === 0 && <p style={mut}>暂无备份记录</p>}
      </div>
    </div>
  </>);
}

/* ---------------- 邀请码 ---------------- */
type Ic = { id: number; code: string; nickname: string | null; active: boolean; created_at: string; expires_at: string | null };
function InviteTab({ isSuper, setMsg }: { isSuper: boolean; setMsg: (s: string) => void }) {
  const [ics, setIcs] = useState<Ic[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newNick, setNewNick] = useState('');
  const [newExp, setNewExp] = useState('0');
  const [batchBusy, setBatchBusy] = useState(false);
  async function load() {
    const { data } = await supabase.from('invite_codes').select('id, code, nickname, active, created_at, expires_at').order('created_at');
    setIcs((data ?? []) as Ic[]);
  }
  useEffect(() => { load(); }, []);
  async function batchCodes(n: number) {
    if (!confirm(`一次生成 ${n} 个随机邀请码？`)) return;
    setBatchBusy(true);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ok = 0;
    for (let i = 0; i < n; i++) {
      let code = '';
      for (let j = 0; j < 6; j++) code += chars[Math.floor(Math.random() * chars.length)];
      const { error } = await supabase.rpc('create_invite_code', { new_code: code, nick: null });
      if (!error) ok++;
    }
    setBatchBusy(false); setMsg(`已生成 ${ok} 个邀请码`); load();
    await alog('invite_batch', { n: ok });
  }
  async function addIc() {
    const c = newCode.trim(); if (!c) return setMsg('请填写邀请码');
    const { error } = await supabase.rpc('create_invite_code', { new_code: c, nick: newNick.trim() || null });
    if (error) { setMsg('添加失败：' + error.message); return; }
    const days = parseInt(newExp, 10);
    if (days > 0) await supabase.from('invite_codes').update({ expires_at: new Date(Date.now() + days * 864e5).toISOString() }).eq('code', c);
    await alog('invite_add', { code: c });
    setMsg('邀请码已添加'); setNewCode(''); setNewNick(''); setNewExp('0'); load();
  }
  async function toggleIc(id: number, a: boolean) {
    const { error } = await supabase.rpc('set_invite_code_active', { cid: id, active: !a });
    if (!error) { await alog('invite_toggle', { id, active: !a }); load(); } else setMsg('操作失败：' + error.message);
  }
  async function delIc(id: number) {
    if (!confirm('删除这个邀请码？')) return;
    const { error } = await supabase.rpc('delete_invite_code', { cid: id });
    if (!error) { await alog('invite_delete', { id }); load(); } else setMsg('删除失败：' + error.message);
  }
  return (
    <div style={card}>
      <h3 style={h3}>邀请码管理</h3>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={mut}>批量生成：</span>
        <button className="mini" disabled={batchBusy} onClick={() => batchCodes(10)}>10 个</button>
        <button className="mini" disabled={batchBusy} onClick={() => batchCodes(20)}>20 个</button>
        <button className="mini" disabled={batchBusy} onClick={() => batchCodes(50)}>50 个</button>
      </div>
      {isSuper ? (<>
        {ics.map(ic => (
          <div key={ic.id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c', opacity: ic.active ? 1 : 0.5 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{ic.code}
              {!ic.active && <span style={mut}>（已停用）</span>}</div>
            <div style={mut}>
              欢迎动画：「{ic.nickname || 'xxx'} — Welcome to Class 13!」
              {ic.expires_at && <> · {new Date(ic.expires_at) < new Date() ? '已过期' : '过期：' + ic.expires_at.slice(0, 16).replace('T', ' ')}</>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="mini ghost" onClick={() => toggleIc(ic.id, ic.active)}>{ic.active ? '停用' : '启用'}</button>
              <button className="mini danger" onClick={() => delIc(ic.id)}>删除</button>
            </div>
          </div>
        ))}
        {ics.length === 0 && <p style={mut}>还没有邀请码，添加一个吧</p>}
        <label style={{ marginTop: 10 }}>新邀请码</label>
        <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="如：zhangsan" maxLength={40} />
        <label style={{ marginTop: 8 }}>欢迎昵称（这个码专属）</label>
        <input value={newNick} onChange={e => setNewNick(e.target.value)} placeholder="如：张三" maxLength={30} style={{ maxWidth: 220 }} />
        <label style={{ marginTop: 8 }}>有效期</label>
        <select value={newExp} onChange={e => setNewExp(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="0">不过期</option><option value="1">1 天（一次性）</option>
          <option value="3">3 天</option><option value="7">7 天</option>
        </select>
        <div style={{ marginTop: 8 }}>
          <button className="pri" style={{ width: 'auto', padding: '10px 24px' }} onClick={addIc}>添加邀请码</button>
        </div>
      </>) : <p style={mut}>邀请码仅超级管理员可管理</p>}
    </div>
  );
}

/* ---------------- 反馈 ---------------- */
type Fb = { id: number; name: string | null; contact: string | null; content: string; kind: string; status: string; created_at: string; user_id: string | null };
function FeedbackTab({ me, isSuper, setMsg }: { me: string; isSuper: boolean; setMsg: (s: string) => void }) {
  const [list, setList] = useState<Fb[]>([]);
  const [filter, setFilter] = useState('all');
  const [replyOpen, setReplyOpen] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [replyBusy, setReplyBusy] = useState(false);
  async function load() {
    const { data } = await supabase.from('feedbacks').select('id, name, contact, content, kind, status, created_at, user_id').order('created_at', { ascending: false }).limit(100);
    setList((data ?? []) as Fb[]);
  }
  useEffect(() => { load(); }, []);
  async function mark(id: number, done: boolean) {
    const { error } = await supabase.from('feedbacks').update({ status: done ? 'done' : 'open' }).eq('id', id);
    if (!error) { await alog('feedback_mark', { id, done }); load(); } else setMsg('操作失败：' + error.message);
  }
  async function del(id: number) {
    if (!confirm('删除这条反馈？')) return;
    const { error } = await supabase.from('feedbacks').delete().eq('id', id);
    if (!error) { await alog('feedback_delete', { id }); load(); } else setMsg('删除失败：' + error.message);
  }
  async function sendReply(fb: Fb) {
    const text = (replyText[fb.id] || '').trim();
    if (!text || !fb.user_id || replyBusy) return;
    setReplyBusy(true);
    try {
      const { data: cid, error: e1 } = await supabase.rpc('get_or_create_conversation', { other: fb.user_id });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body: text.slice(0, 2000) });
      if (e2) throw e2;
      setReplyText({ ...replyText, [fb.id]: '' }); setReplyOpen(null);
      await alog('feedback_reply', { id: fb.id });
      setMsg('消息已发送，对方在「好友 - 聊天」里能看到');
    } catch (e: any) { setMsg('发送失败：' + (e?.message || '')); }
    finally { setReplyBusy(false); }
  }
  const shown = list.filter(f => filter === 'all' ? true : f.status === filter);
  const todo = list.filter(f => f.status === 'open').length;
  return (
    <div style={card}>
      <h3 style={h3}>反馈管理（{todo} 条未处理）</h3>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        {([['all', '全部'], ['open', '未处理'], ['done', '已处理']] as const).map(([k, l]) => (
          <button key={k} className={'mini' + (filter === k ? '' : ' ghost')} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {shown.length === 0 && <p style={mut}>暂无反馈</p>}
      {shown.map(f => (
        <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid #ffffff0c', opacity: f.status === 'done' ? 0.55 : 1 }}>
          <div style={{ fontSize: 12 }}>
            <span style={mut}>{f.kind === 'login' ? '登录反馈' : '意见反馈'} · {(f.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            {(f.name || f.contact) && <span style={mut}> — {f.name ?? ''}{f.name && f.contact ? ' / ' : ''}{f.contact ?? ''}</span>}
            {f.status === 'done' && <span style={{ color: '#7ee2a8', marginLeft: 6 }}>已处理</span>}
          </div>
          <div style={{ fontSize: 14, margin: '4px 0 8px' }}>{f.content}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="mini ghost" onClick={() => mark(f.id, f.status !== 'done')}>{f.status === 'done' ? '标为未处理' : '标为已处理'}</button>
            {f.user_id && <button className="mini" onClick={() => setReplyOpen(replyOpen === f.id ? null : f.id)}>给提交人发消息</button>}
            {isSuper && <button className="mini danger" onClick={() => del(f.id)}>删除</button>}
          </div>
          {replyOpen === f.id && (
            <div style={{ marginTop: 8 }}>
              <textarea value={replyText[f.id] || ''} onChange={e => setReplyText({ ...replyText, [f.id]: e.target.value })} rows={3} maxLength={2000} placeholder="告诉提交人处理结果…" style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="mini" disabled={replyBusy} onClick={() => sendReply(f)}>{replyBusy ? '发送中…' : '发送'}</button>
                <button className="mini ghost" onClick={() => setReplyOpen(null)}>取消</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- 段位审核 ---------------- */
type Gp = { profile_id: string; game_name: string; rank: string | null; game_uid: string | null; status: string };
function GameTab({ setMsg }: { setMsg: (s: string) => void }) {
  const [pend, setPend] = useState<Gp[]>([]);
  const [ok, setOk] = useState<Gp[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  async function load() {
    const { data } = await supabase.from('game_profiles').select('profile_id, game_name, rank, game_uid, status').order('created_at', { ascending: false });
    const list = (data ?? []) as Gp[];
    setPend(list.filter(x => x.status === 'pending')); setOk(list.filter(x => x.status === 'approved'));
    const ids = [...new Set(list.map(x => x.profile_id))];
    if (ids.length) {
      const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 200, skip: 0 });
      const mp: Record<string, string> = {};
      ((dir ?? []) as any[]).forEach((x: any) => { if (ids.includes(x.id)) mp[x.id] = x.display_name ?? x.username; });
      setNames(mp);
    }
  }
  useEffect(() => { load(); }, []);
  async function review(pid: string, approve: boolean) {
    const { error } = await supabase.rpc('review_game_profile', { pid, approve });
    if (!error) { await alog(approve ? 'game_approve' : 'game_reject', { pid }); load(); setMsg(approve ? '已通过' : '已驳回'); }
    else setMsg('操作失败：' + error.message);
  }
  async function revoke(pid: string) {
    if (!confirm('撤销这个段位认证？')) return;
    const { error } = await supabase.rpc('review_game_profile', { pid, approve: false });
    if (!error) { await alog('game_revoke', { pid }); load(); } else setMsg('操作失败：' + error.message);
  }
  return (
    <div style={card}>
      <h3 style={h3}>游戏段位审核</h3>
      {pend.length === 0 && ok.length === 0 && <p style={mut}>暂无提交</p>}
      {pend.length > 0 && <>
        <p style={mut}>待审核（{pend.length}）</p>
        {pend.map(g => (
          <div key={g.profile_id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <div style={{ fontSize: 13.5 }}><b>{names[g.profile_id] || '…'}</b> · {g.game_name}
              {g.rank ? <> · <span style={{ color: '#ffd9ec' }}>{g.rank}</span></> : <span style={mut}>（未填段位）</span>}
              {g.game_uid && <span style={mut}> · ID: {g.game_uid}</span>}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="mini" onClick={() => review(g.profile_id, true)}>通过</button>
              <button className="mini ghost" onClick={() => review(g.profile_id, false)}>驳回</button>
            </div>
          </div>
        ))}
      </>}
      {ok.length > 0 && <>
        <p style={{ ...mut, marginTop: 10 }}>已通过（{ok.length}）</p>
        {ok.map(g => (
          <div key={g.profile_id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #ffffff0c' }}>
            <span style={{ fontSize: 13 }}>{names[g.profile_id] || '…'} · {g.game_name}{g.rank ? ` · ${g.rank}` : ''}</span>
            <button className="mini danger" onClick={() => revoke(g.profile_id)}>撤销</button>
          </div>
        ))}
      </>}
    </div>
  );
}

/* ---------------- 测试工具 ---------------- */
type TA = { id: string; label: string; email: string; password: string };
function loadTAs(): TA[] {
  try {
    const current = sessionStorage.getItem('ca_test_accounts');
    if (current) return JSON.parse(current);
    // 兼容迁移旧版本：只把旧数据移入当前标签页会话，随后立即清除长期存储。
    const legacy = localStorage.getItem('ca_test_accounts');
    if (!legacy) return [];
    const parsed = JSON.parse(legacy);
    sessionStorage.setItem('ca_test_accounts', JSON.stringify(parsed));
    localStorage.removeItem('ca_test_accounts');
    return parsed;
  } catch { return []; }
}
function TestTab({ setMsg }: { setMsg: (s: string) => void }) {
  const { session } = useAuth();
  const [tas, setTas] = useState<TA[]>(loadTAs);
  const [label, setLabel] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  function save(list: TA[]) {
    setTas(list);
    try {
      sessionStorage.setItem('ca_test_accounts', JSON.stringify(list));
      localStorage.removeItem('ca_test_accounts');
    } catch {}
  }
  async function switchTo(a: TA) {
    if (!confirm(`切换登录到 ${a.label || a.email}？`)) return;
    if (!session?.user.email) return setMsg('无法读取当前账号邮箱，请先重新登录。');
    try {
      sessionStorage.setItem('ca_testing_from', session.user.email);
      sessionStorage.setItem('ca_testing_as', a.label || a.email);
    } catch {
      return setMsg('浏览器无法保存本次切换状态，请检查存储权限。');
    }
    const { error } = await supabase.auth.signInWithPassword({ email: a.email, password: a.password });
    if (error) {
      try {
        sessionStorage.removeItem('ca_testing_as');
        sessionStorage.removeItem('ca_testing_from');
      } catch {}
      setMsg('切换失败，请检查测试账号和密码。');
    } else {
      location.reload();
    }
  }
  return (
    <div style={card}>
      <h3 style={h3}>测试工具</h3>
      <p style={mut}>测试账号快切：密码只存这台手机浏览器里。切出去后右下角有"结束测试"一键切回。</p>
      {tas.map(a => (
        <div key={a.id} className="row" style={{ alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{a.label || a.email}</div>
            <div style={mut}>{a.email}</div>
          </div>
          <button className="mini" onClick={() => switchTo(a)}>切换登录</button>
          <button className="mini danger" onClick={() => save(tas.filter(x => x.id !== a.id))}>删除</button>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input placeholder="备注名（选填）" value={label} onChange={e => setLabel(e.target.value)} style={{ flex: '1 1 90px', minWidth: 0 }} />
        <input placeholder="QQ 邮箱" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" style={{ flex: '1 1 110px', minWidth: 0 }} />
        <input type="password" placeholder="密码" value={pw} onChange={e => setPw(e.target.value)} style={{ flex: '1 1 90px', minWidth: 0 }} />
        <button className="mini" onClick={() => {
          if (!email.trim() || !pw) return setMsg('邮箱和密码都要填');
          save([...tas, { id: String(Date.now()), label: label.trim(), email: email.trim(), password: pw }]);
          setLabel(''); setEmail(''); setPw(''); setMsg('已保存');
        }}>保存账号</button>
      </div>
    </div>
  );
}

/* ---------------- 活动管理 ---------------- */
function EventTab({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [at, setAt] = useState('');
  const [loc, setLoc] = useState('');
  async function load() {
    const { data } = await supabase.from('events').select('*').order('event_at', { ascending: true }).limit(30);
    setList(data ?? []);
  }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!title.trim()) return setMsg('先写活动标题');
    const { error } = await supabase.from('events').insert({
      title: title.trim().slice(0, 60), description: desc.trim().slice(0, 500) || null,
      event_at: at ? new Date(at).toISOString() : null, location: loc.trim() || null, created_by: me,
    });
    if (error) setMsg('发布失败：' + error.message);
    else { await alog('event_add', { title: title.trim() }); setTitle(''); setDesc(''); setAt(''); setLoc(''); load(); setMsg('活动已发布'); }
  }
  async function del(id: number) {
    if (!confirm('删除这个活动？报名数据一起删除。')) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) { await alog('event_delete', { id }); load(); } else setMsg('删除失败：' + error.message);
  }
  return (
    <div style={card}>
      <h3 style={h3}>活动管理</h3>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="活动标题，如：毕业聚餐" maxLength={60} style={{ marginBottom: 8 }} />
      <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="活动介绍…" rows={2} maxLength={500} style={{ width: '100%', marginBottom: 8 }} />
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} style={{ flex: 1 }} />
        <input value={loc} onChange={e => setLoc(e.target.value)} placeholder="地点" style={{ flex: 1 }} />
      </div>
      <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={add}>发布活动</button>
      <div style={{ marginTop: 12 }}>
        {list.map(e => (
          <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{e.title}</div>
            <div style={mut}>{e.event_at ? new Date(e.event_at).toLocaleString() : '时间待定'}{e.location ? ` · ${e.location}` : ''}</div>
            <button className="mini danger" style={{ marginTop: 6 }} onClick={() => del(e.id)}>删除</button>
          </div>
        ))}
        {list.length === 0 && <p style={mut}>暂无活动</p>}
      </div>
    </div>
  );
}
