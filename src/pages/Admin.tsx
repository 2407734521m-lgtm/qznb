import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type Member = { id: string; username: string; display_name: string | null; real_name: string | null; role: string; joined: boolean; created_at: string };
type Log = { id: number; action: string; detail: unknown; created_at: string };
type Post = { id: number; content: string; author_id: string; created_at: string };
type Alb = { id: number; title: string; category: string; created_at: string };
type Fb = { id: number; name: string | null; contact: string | null; content: string; kind: string; status: string; created_at: string };
type Gp = { profile_id: string; game_name: string; game_uid: string | null; rank: string | null; status: string; updated_at: string };
type Ic = { id: number; code: string; nickname: string | null; active: boolean; created_at: string };
type TestAccount = { id: string; label: string; email: string; password: string };

const TA_KEY = 'ca_test_accounts';
function loadTAs(): TestAccount[] {
  try { const v = JSON.parse(localStorage.getItem(TA_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

const ROLE_LABEL: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', member: '成员' };

export default function Admin() {
  const me = useAuth().session!.user.id;
  const [role, setRole] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<Log[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [albums, setAlbums] = useState<Alb[]>([]);
  const [ics, setIcs] = useState<Ic[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newNick, setNewNick] = useState('');
  const [feedbacks, setFeedbacks] = useState<Fb[]>([]);
  const [gpend, setGpend] = useState<Gp[]>([]);
  const [gok, setGok] = useState<Gp[]>([]);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [stats, setStats] = useState({ posts: 0, photos: 0 });
  // 测试账号快切（仅超管）：账号存本机，一键切换登录方便测试
  const [tas, setTas] = useState<TestAccount[]>(loadTAs);
  const [taLabel, setTaLabel] = useState('');
  const [taEmail, setTaEmail] = useState('');
  const [taPw, setTaPw] = useState('');
  const [taMsg, setTaMsg] = useState('');

  useEffect(() => { supabase.rpc('my_role').then(({ data }) => setRole(data ?? '')); }, []);

  async function refresh() {
    const m = await supabase.from('profiles')
      .select('id, username, display_name, real_name, role, joined, created_at').order('created_at');
    if (!m.error) setMembers(m.data as Member[]);
    const em = await supabase.from('profile_emails').select('profile_id, email');
    if (!em.error) setEmails(Object.fromEntries((em.data ?? []).map((x: any) => [x.profile_id, x.email])));
    const ic = await supabase.from('invite_codes').select('id, code, nickname, active, created_at').order('created_at');
    if (!ic.error) setIcs(ic.data as Ic[]);
    const fb = await supabase.from('feedbacks').select('id, name, contact, content, kind, status, created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (!fb.error) setFeedbacks(fb.data as Fb[]);
    const gp = await supabase.from('game_profiles')
      .select('profile_id, game_name, game_uid, rank, status, updated_at').order('updated_at', { ascending: false });
    if (!gp.error) {
      const list = gp.data as Gp[];
      setGpend(list.filter(x => x.status === 'pending'));
      setGok(list.filter(x => x.status === 'approved'));
    }
    const l = await supabase.from('admin_audit_logs')
      .select('id, action, detail, created_at').order('created_at', { ascending: false }).limit(50);
    if (!l.error) setLogs(l.data as Log[]);
    const p = await supabase.from('posts').select('id, content, author_id, created_at')
      .order('created_at', { ascending: false }).limit(30);
    if (!p.error) setPosts(p.data as Post[]);
    const a = await supabase.from('albums').select('id, title, category, created_at')
      .order('created_at', { ascending: false }).limit(30);
    if (!a.error) setAlbums(a.data as Alb[]);
    const pc = await supabase.from('posts').select('id', { count: 'exact', head: true });
    const hc = await supabase.from('album_photos').select('id', { count: 'exact', head: true });
    setStats({ posts: pc.count ?? 0, photos: hc.count ?? 0 });
  }

  useEffect(() => { if (role === 'admin' || role === 'super_admin') refresh(); }, [role]);

  if (role === null) return <div className="page"><div className="center">加载中…</div></div>;
  if (role !== 'admin' && role !== 'super_admin')
    return <div className="page"><div className="center"><div className="card">无权访问管理后台</div></div></div>;
  const isSuper = role === 'super_admin';
  const nameOf = (id: string) => { const mb = members.find(x => x.id === id); return mb ? (mb.display_name || mb.username) : id.slice(0, 8); };

  async function changeRole(id: string, newRole: string) {
    setMsg('');
    const { error } = await supabase.rpc('set_role', { target: id, new_role: newRole });
    setMsg(error ? '操作失败：' + error.message : '已更新');
    if (!error) refresh();
  }
  async function addIc() {
    const c = newCode.trim();
    if (!c) return setMsg('请填写邀请码');
    setMsg('');
    const { error } = await supabase.rpc('create_invite_code', { new_code: c, nick: newNick.trim() || null });
    setMsg(error ? '添加失败：' + error.message : '邀请码已添加 ✓');
    if (!error) { setNewCode(''); setNewNick(''); refresh(); }
  }
  async function delIc(id: number) {
    if (!confirm('删除这个邀请码？之前用它加入的成员不受影响。')) return;
    const { error } = await supabase.rpc('delete_invite_code', { cid: id });
    if (!error) refresh(); else setMsg('删除失败：' + error.message);
  }
  async function toggleIc(id: number, a: boolean) {
    const { error } = await supabase.rpc('set_invite_code_active', { cid: id, active: !a });
    if (!error) refresh(); else setMsg('操作失败：' + error.message);
  }

  function saveTAs(list: TestAccount[]) {
    setTas(list);
    try { localStorage.setItem(TA_KEY, JSON.stringify(list)); } catch {}
  }
  function addTa() {
    const em = taEmail.trim();
    if (!em || !taPw) return setTaMsg('邮箱和密码都要填');
    saveTAs([...loadTAs(), { id: 'ta' + Date.now(), label: taLabel.trim(), email: em, password: taPw }]);
    setTaLabel(''); setTaEmail(''); setTaPw(''); setTaMsg('已保存 ✓');
  }
  function delTa(id: string) { saveTAs(loadTAs().filter(a => a.id !== id)); }
  async function switchTo(a: TestAccount) {
    if (!confirm(`切换登录到 ${a.label || a.email}？当前账号会先退出。`)) return;
    setTaMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    const fromEmail = user?.email || '';
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email: a.email, password: a.password });
    if (error) return; // 已退到登录页，手动登录即可
    try {
      sessionStorage.setItem('ca_testing_as', a.email);
      sessionStorage.setItem('ca_testing_from', fromEmail);
    } catch {}
  }
  async function markFb(id: number, done: boolean) {
    const { error } = await supabase.from('feedbacks').update({ status: done ? 'done' : 'open' }).eq('id', id);
    if (!error) refresh(); else setMsg('操作失败：' + error.message);
  }
  async function delFb(id: number) {
    if (!confirm('删除这条反馈？')) return;
    const { error } = await supabase.from('feedbacks').delete().eq('id', id);
    if (!error) refresh(); else setMsg('删除失败：' + error.message);
  }
  async function reviewGp(pid: string, approve: boolean) {
    setMsg('');
    const { error } = await supabase.rpc('review_game_profile', { pid, approve });
    setMsg(error ? '操作失败：' + error.message : approve ? '已通过 ✓' : '已驳回');
    if (!error) refresh();
  }
  async function revokeGp(pid: string) {
    if (!confirm('撤销该成员的段位认证？卡片标签会消失。')) return;
    const { error } = await supabase.from('game_profiles').delete().eq('profile_id', pid);
    if (!error) refresh(); else setMsg('操作失败：' + error.message);
  }
  async function delPost(id: number) {
    if (!confirm('删除这条动态（含评论点赞）？')) return;
    await supabase.from('posts').delete().eq('id', id); refresh();
  }
  async function delAlbum(id: number) {
    if (!confirm('删除这个相册（含所有照片）？')) return;
    await supabase.from('albums').delete().eq('id', id); refresh();
  }
  async function delMember(id: string, name: string) {
    if (!confirm(`彻底删除成员 ${name}？他的账号、资料、动态、照片、好友等所有数据都会被删除，无法恢复！`)) return;
    if (!confirm('再次确认：真的要彻底删除吗？')) return;
    setMsg('');
    const { error } = await supabase.rpc('delete_member', { target: id });
    setMsg(error ? '删除失败：' + error.message : '已彻底删除');
    if (!error) refresh();
  }
  async function toggleJoined(id: string, j: boolean) {
    if (!confirm(j ? '恢复该成员加入班级？' : '将该成员移出班级？移出后他看不到成员内容，别人也看不到他。')) return;
    setMsg('');
    const { error } = await supabase.rpc('set_joined', { target: id, j });
    setMsg(error ? '操作失败：' + error.message : '已更新');
    if (!error) refresh();
  }
  const shown = members.filter(mb => {
    const s = q.trim().toLowerCase(); if (!s) return true;
    return (mb.display_name || '').toLowerCase().includes(s) || mb.username.toLowerCase().includes(s)
      || (emails[mb.id] || '').toLowerCase().includes(s) || (mb.real_name || '').toLowerCase().includes(s);
  });

  return (
    <div className="page">
      <div className="hero" style={{ paddingTop: 8 }}>
        <h1 style={{ fontSize: 24 }}>管理后台</h1>
        <p>{isSuper ? '超 级 管 理 员' : '管 理 员'}</p>
      </div>
      {msg && <p className="card" style={{ padding: 12 }}>{msg}</p>}

      <div className="row" style={{ gap: 10 }}>
        {[['成员', members.length], ['已加入', members.filter(x => x.joined).length],
          ['动态', stats.posts], ['照片', stats.photos]].map(([l, n]) => (
          <div key={l as string} className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 4px', margin: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{n}</div>
            <div className="mut" style={{ fontSize: 12 }}>{l}</div>
          </div>
        ))}
      </div>

      {isSuper && (
        <div className="adm-sec card">
          <h3>⇄ 测试账号快切</h3>
          <p className="priv-note" style={{ margin: '0 0 8px' }}>保存测试账号，一键切换登录，方便测试。密码只存这台手机的浏览器里。建议把管理号也存进来，切出去后右下角会有"结束测试"一键切回。</p>
          {tas.map(a => (
            <div key={a.id} className="row" style={{ alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{a.label || a.email}</div>
                <div className="mut" style={{ fontSize: 12 }}>{a.email}</div>
              </div>
              <button className="mini" onClick={() => switchTo(a)}>切换登录</button>
              <button className="mini danger" onClick={() => delTa(a.id)}>删除</button>
            </div>
          ))}
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input placeholder="备注名（选填，如：测试号）" value={taLabel} onChange={e => setTaLabel(e.target.value)}
              style={{ flex: '1 1 90px', minWidth: 0 }} />
            <input placeholder="QQ 邮箱" value={taEmail} onChange={e => setTaEmail(e.target.value)} inputMode="email"
              style={{ flex: '1 1 110px', minWidth: 0 }} />
            <input type="password" placeholder="密码" value={taPw} onChange={e => setTaPw(e.target.value)}
              style={{ flex: '1 1 90px', minWidth: 0 }} />
            <button className="mini" onClick={addTa}>保存账号</button>
          </div>
          {taMsg && <p className="priv-note" style={{ marginTop: 6 }}>{taMsg}</p>}
        </div>
      )}

      <div className="adm-sec card">
        <h3>成员管理（{shown.length} 人）</h3>
        <input placeholder="🔍 搜索名字 / 用户名 / 真实姓名 / 邮箱" value={q} onChange={e => setQ(e.target.value)}
          style={{ marginBottom: 10 }} />
        <table className="tbl"><thead><tr><th>成员</th><th>邮箱</th><th>角色</th><th>状态</th><th></th></tr></thead>
          <tbody>{shown.map(mb => (
            <tr key={mb.id}>
              <td>{mb.display_name || mb.username}<br /><span className="mut" style={{ fontSize: 12 }}>@{mb.username}{mb.real_name ? ` · ${mb.real_name}` : ''}</span></td>
              <td style={{ fontSize: 12 }}>{emails[mb.id] ?? '—'}</td>
              <td><span className={`chip ${mb.role === 'super_admin' ? 'sa' : mb.role === 'admin' ? 'ad' : ''}`}>{ROLE_LABEL[mb.role] ?? mb.role}</span></td>
              <td style={{ fontSize: 13 }}>{mb.joined ? '已加入' : '未加入'}</td>
              <td>{isSuper && mb.id !== me && mb.role !== 'super_admin' && (
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {mb.role === 'admin'
                    ? <button className="mini" onClick={() => changeRole(mb.id, 'member')}>降为成员</button>
                    : <button className="mini" onClick={() => changeRole(mb.id, 'admin')}>设为管理员</button>}
                  <button className="mini" onClick={() => toggleJoined(mb.id, !mb.joined)}>{mb.joined ? '移出班级' : '恢复'}</button>
                  {mb.id !== me && <button className="mini danger" onClick={() => delMember(mb.id, mb.display_name || mb.username)}>删除</button>}
                </span>
              )}</td>
            </tr>
          ))}</tbody></table>
      </div>

      <div className="adm-sec card">
        <h3>🎟️ 邀请码管理</h3>
        {isSuper ? (<>
          {ics.map(ic => (
            <div key={ic.id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c', opacity: ic.active ? 1 : 0.5 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{ic.code}
                {!ic.active && <span className="mut" style={{ fontSize: 12, fontWeight: 400 }}>（已停用）</span>}</div>
              <div className="mut" style={{ fontSize: 12.5, marginTop: 2 }}>
                欢迎动画：「{ic.nickname || 'xxx'} — Welcome to Class 13!」
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="mini ghost" onClick={() => toggleIc(ic.id, ic.active)}>{ic.active ? '停用' : '启用'}</button>
                <button className="mini danger" onClick={() => delIc(ic.id)}>删除</button>
              </div>
            </div>
          ))}
          {ics.length === 0 && <p className="mut" style={{ fontSize: 13 }}>还没有邀请码，添加一个吧</p>}
          <label style={{ marginTop: 10 }}>新邀请码</label>
          <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="如：zhangsan" maxLength={40} />
          <label style={{ marginTop: 8 }}>欢迎昵称（这个码专属）</label>
          <input value={newNick} onChange={e => setNewNick(e.target.value)} placeholder="如：张三" maxLength={30} style={{ maxWidth: 220 }} />
          <div style={{ marginTop: 8 }}>
            <button className="pri" style={{ width: 'auto', padding: '10px 24px' }} onClick={addIc}>＋ 添加邀请码</button>
          </div>
          <p className="mut" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            给不同同学发不同的邀请码，每个人加入时看到的欢迎动画就是他自己的名字
          </p>
        </>) : <p className="mut">邀请码仅超级管理员可管理</p>}
      </div>

      <div className="adm-sec card">
        <h3>💬 反馈管理（{feedbacks.filter(f => f.status === 'open').length} 条未处理）</h3>
        {feedbacks.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无反馈</p>}
        {feedbacks.map(f => (
          <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid #ffffff0c', opacity: f.status === 'done' ? 0.55 : 1 }}>
            <div style={{ fontSize: 13.5 }}>
              <span className="mut" style={{ fontSize: 11.5, marginRight: 6 }}>
                {f.kind === 'login' ? '🔑 登录反馈' : '💬 意见反馈'} · {(f.created_at || '').slice(0, 16).replace('T', ' ')}
              </span>
              {(f.name || f.contact) && <span className="mut" style={{ fontSize: 12 }}> — {f.name ?? ''}{f.name && f.contact ? ' / ' : ''}{f.contact ?? ''}</span>}
              {f.status === 'done' && <span style={{ fontSize: 11.5, color: '#7ee2a8', marginLeft: 6 }}>✓ 已处理</span>}
            </div>
            <div style={{ fontSize: 14, margin: '4px 0 8px' }}>{f.content}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="mini ghost" onClick={() => markFb(f.id, f.status !== 'done')}>
                {f.status === 'done' ? '标为未处理' : '标为已处理'}</button>
              {isSuper && <button className="mini danger" onClick={() => delFb(f.id)}>删除</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="adm-sec card">
        <h3>🎮 游戏段位审核</h3>
        {gpend.length === 0 && gok.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无提交</p>}
        {gpend.length > 0 && <>
          <p className="mut" style={{ fontSize: 12.5 }}>待审核（{gpend.length}）</p>
          {gpend.map(g => (
            <div key={g.profile_id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
              <div style={{ fontSize: 13.5 }}><b>{nameOf(g.profile_id)}</b> · {g.game_name}
                {g.rank ? <> · <span style={{ color: '#ffd9ec' }}>{g.rank}</span></> : <span className="mut">（未填段位）</span>}
                {g.game_uid && <span className="mut"> · ID: {g.game_uid}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="mini pri" onClick={() => reviewGp(g.profile_id, true)}>✓ 通过</button>
                <button className="mini ghost" onClick={() => reviewGp(g.profile_id, false)}>✕ 驳回</button>
              </div>
            </div>
          ))}
        </>}
        {gok.length > 0 && <>
          <p className="mut" style={{ fontSize: 12.5, marginTop: 10 }}>已通过（{gok.length}）</p>
          {gok.map(g => (
            <div key={g.profile_id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #ffffff0c' }}>
              <span style={{ fontSize: 13 }}>{nameOf(g.profile_id)} · {g.game_name}{g.rank ? ` · ${g.rank}` : ''}</span>
              <button className="mini danger" onClick={() => revokeGp(g.profile_id)}>撤销</button>
            </div>
          ))}
        </>}
      </div>

      <div className="adm-sec card">
        <h3>动态管理</h3>
        {posts.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无动态</p>}
        {posts.map(p => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <span style={{ fontSize: 13.5 }}>{nameOf(p.author_id)}：{(p.content || '').slice(0, 40)}{(p.content || '').length > 40 ? '…' : ''}
              <br /><span className="mut" style={{ fontSize: 12 }}>{(p.created_at || '').slice(0, 16).replace('T', ' ')}</span></span>
            <button className="mini danger" onClick={() => delPost(p.id)}>删除</button>
          </div>
        ))}
      </div>

      <div className="adm-sec card">
        <h3>相册管理</h3>
        {albums.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无相册</p>}
        {albums.map(a => (
          <div key={a.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <span style={{ fontSize: 13.5 }}>{a.title} · {a.category}</span>
            <button className="mini danger" onClick={() => delAlbum(a.id)}>删除</button>
          </div>
        ))}
      </div>

      <div className="adm-sec card">
        <h3>操作日志</h3>
        {logs.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无记录</p>}
        {logs.map(l => (
          <div key={l.id} className="log">
            {(l.created_at ?? '').slice(0, 16).replace('T', ' ')} · {l.action} · {JSON.stringify(l.detail ?? {})}
          </div>
        ))}
      </div>
    </div>
  );
}
