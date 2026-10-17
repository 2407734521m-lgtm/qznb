import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type Member = { id: string; username: string; display_name: string | null; real_name: string | null; role: string; joined: boolean; created_at: string };
type Log = { id: number; action: string; detail: unknown; created_at: string };
type Post = { id: number; content: string; author_id: string; created_at: string };
type Alb = { id: number; title: string; category: string; created_at: string };
type Fb = { id: number; name: string | null; contact: string | null; content: string; kind: string; status: string; created_at: string; user_id: string | null };
type Gp = { profile_id: string; game_name: string; game_uid: string | null; rank: string | null; status: string; updated_at: string };
type Ic = { id: number; code: string; nickname: string | null; active: boolean; created_at: string };
type Notice = { id: number; content: string; created_at: string };
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
  // 给反馈提交人发消息
  const [replyOpen, setReplyOpen] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [replyBusy, setReplyBusy] = useState(false);
  // 公告管理
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeText, setNoticeText] = useState('');
  // 成员位置与设备
  const [presence, setPresence] = useState<Record<string, { device: string | null; location: string | null; updated_at: string | null }>>({});
  // 10 个新功能的状态
  const [gq, setGq] = useState('');                       // 全站搜索
  const [fbFilter, setFbFilter] = useState('all');        // 反馈筛选：all/open/done
  const [logQ, setLogQ] = useState('');                   // 日志筛选
  const [editId, setEditId] = useState<string | null>(null); // 正在编辑资料的成员
  const [editForm, setEditForm] = useState({ display_name: '', real_name: '', signature: '' });
  const [batchBusy, setBatchBusy] = useState(false);

  useEffect(() => { supabase.rpc('my_role').then(({ data }) => setRole(data ?? '')); }, []);

  async function refresh() {
    const m = await supabase.from('profiles')
      .select('id, username, display_name, real_name, role, joined, created_at').order('created_at');
    if (!m.error) setMembers(m.data as Member[]);
    const em = await supabase.from('profile_emails').select('profile_id, email');
    if (!em.error) setEmails(Object.fromEntries((em.data ?? []).map((x: any) => [x.profile_id, x.email])));
    const ic = await supabase.from('invite_codes').select('id, code, nickname, active, created_at').order('created_at');
    if (!ic.error) setIcs(ic.data as Ic[]);
    const fb = await supabase.from('feedbacks').select('id, name, contact, content, kind, status, created_at, user_id')
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
    const nt = await supabase.from('board_messages').select('id, content, created_at')
      .eq('is_admin_msg', true).order('created_at', { ascending: false }).limit(20);
    if (!nt.error) setNotices(nt.data as Notice[]);
    const mp = await supabase.from('member_presence').select('profile_id, device, location, updated_at');
    if (!mp.error) setPresence(Object.fromEntries((mp.data ?? []).map((x: any) => [x.profile_id, x])));
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
  // 给反馈提交人发站内消息（对方在 好友-聊天 里能看到）
  async function sendReply(fb: Fb) {
    const text = (replyText[fb.id] || '').trim();
    if (!text || !fb.user_id) return;
    if (replyBusy) return;
    setReplyBusy(true); setMsg('');
    try {
      const { data: cid, error: e1 } = await supabase.rpc('get_or_create_conversation', { other: fb.user_id });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('messages').insert({
        conversation_id: Number(cid), sender_id: me, body: text.slice(0, 2000),
      });
      if (e2) throw e2;
      setReplyText({ ...replyText, [fb.id]: '' });
      setReplyOpen(null);
      setMsg('消息已发送 ✓，对方在「好友 - 聊天」里能看到');
    } catch (e: any) {
      setMsg('发送失败：' + (e?.message || '网络错误'));
    } finally { setReplyBusy(false); }
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
  // 公告管理：只有管理员能发布，会置顶在公告板最上面
  async function postNotice() {
    const c = noticeText.trim();
    if (!c) return setMsg('先写点公告内容');
    setMsg('');
    const { error } = await supabase.from('board_messages')
      .insert({ author_id: me, content: c.slice(0, 500), is_admin_msg: true });
    setMsg(error ? '发布失败：' + error.message : '公告已发布 ✓（公告板最上面能看到）');
    if (!error) { setNoticeText(''); refresh(); }
  }
  async function delNotice(id: number) {
    if (!confirm('删除这条公告？')) return;
    await supabase.from('board_messages').delete().eq('id', id);
    refresh();
  }
  // —— 10 个新功能 ——
  // 1) 批量生成邀请码
  async function batchCodes(n: number) {
    if (!confirm(`一次生成 ${n} 个随机邀请码？`)) return;
    setBatchBusy(true); setMsg('');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ok = 0;
    for (let i = 0; i < n; i++) {
      let code = '';
      for (let j = 0; j < 6; j++) code += chars[Math.floor(Math.random() * chars.length)];
      const { error } = await supabase.rpc('create_invite_code', { new_code: code, nick: null });
      if (!error) ok++;
    }
    setBatchBusy(false);
    setMsg(`已生成 ${ok} 个邀请码 ✓`);
    refresh();
  }
  // 2) 通讯录导出 CSV
  function exportCSV() {
    const rows: string[][] = [['姓名', '用户名', '真实姓名', '邮箱', '角色', '已加入']];
    members.forEach(m => rows.push([
      m.display_name || '', m.username, m.real_name || '', emails[m.id] || '',
      ROLE_LABEL[m.role] || m.role, m.joined ? '是' : '否',
    ]));
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = '班级通讯录.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setMsg('通讯录已导出 ✓');
  }
  // 3) 数据导出 JSON（动态/相册/留言/反馈/公告）
  async function exportJSON() {
    setMsg('正在打包数据…');
    const [p, a, b, f] = await Promise.all([
      supabase.from('posts').select('id, author_id, content, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('albums').select('id, title, category, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('board_messages').select('id, author_id, content, is_admin_msg, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('feedbacks').select('id, name, contact, content, kind, status, created_at').order('created_at', { ascending: false }).limit(500),
    ]);
    const data = { exported_at: new Date().toISOString(), posts: p.data ?? [], albums: a.data ?? [], board: b.data ?? [], feedbacks: f.data ?? [] };
    const aEl = document.createElement('a');
    aEl.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    aEl.download = '班级数据备份.json'; aEl.click();
    setTimeout(() => URL.revokeObjectURL(aEl.href), 5000);
    setMsg('数据已导出 ✓');
  }
  // 4) 编辑成员资料
  function startEdit(mb: Member) {
    setEditId(mb.id);
    setEditForm({ display_name: mb.display_name || '', real_name: mb.real_name || '', signature: '' });
    const prof = supabase.from('profiles').select('signature').eq('id', mb.id).maybeSingle()
      .then(({ data }) => { if (data) setEditForm(f => ({ ...f, signature: (data as any).signature || '' })); });
    void prof;
  }
  async function saveEdit() {
    if (!editId) return;
    setMsg('');
    const { error } = await supabase.rpc('admin_update_profile', {
      target: editId,
      p_display_name: editForm.display_name.trim() || null,
      p_real_name: editForm.real_name.trim() || null,
      p_signature: editForm.signature.trim() || null,
    });
    setMsg(error ? '保存失败：' + error.message : '已更新 ✓');
    if (!error) { setEditId(null); refresh(); }
  }
  // 待办 / 在线 / 趋势（纯计算）
  const todoFb = feedbacks.filter(f => f.status === 'open').length;
  const todoGame = gpend.length;
  const todoJoin = members.filter(m => !m.joined).length;
  const onlineList = members.filter(m => {
    const t = presence[m.id]?.updated_at;
    return t && Date.now() - new Date(t).getTime() < 15 * 60 * 1000;
  });
  const trend = (() => {
    const days: { k: string; label: string; n: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      days.push({ k, label: k.slice(5), n: 0 });
    }
    members.forEach(m => {
      const k = (m.created_at || '').slice(0, 10);
      const f = days.find(x => x.k === k);
      if (f) f.n++;
    });
    return days;
  })();
  const trendMax = Math.max(1, ...trend.map(d => d.n));
  // 全站搜索（基于已加载的数据）
  const gqs = gq.trim().toLowerCase();
  const searchRes = gqs ? {
    members: members.filter(m => (m.display_name || '').toLowerCase().includes(gqs) || m.username.toLowerCase().includes(gqs) || (m.real_name || '').toLowerCase().includes(gqs)),
    posts: posts.filter(p => (p.content || '').toLowerCase().includes(gqs)),
    albums: albums.filter(a => (a.title || '').toLowerCase().includes(gqs)),
    feedbacks: feedbacks.filter(f => (f.content || '').toLowerCase().includes(gqs) || (f.name || '').toLowerCase().includes(gqs)),
    notices: notices.filter(n => n.content.toLowerCase().includes(gqs)),
  } : null;
  const fbShown = feedbacks.filter(f => fbFilter === 'all' ? true : f.status === fbFilter);
  const logShown = logs.filter(l => {
    const s = logQ.trim().toLowerCase(); if (!s) return true;
    return (l.action || '').toLowerCase().includes(s) || JSON.stringify(l.detail ?? {}).toLowerCase().includes(s);
  });
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
  // 分区导航
  const NAV: [string, string][] = [
    ['adm-overview', '📊 总览'], ['adm-board', '📢 公告'], ['adm-members', '👥 成员'],
    ['adm-invite', '🎟️ 邀请码'], ['adm-feedback', '💬 反馈'], ['adm-game', '🎮 段位'],
    ['adm-content', '🖼️ 内容'], ['adm-search', '🔍 搜索'], ['adm-export', '💾 导出'],
    ...(isSuper ? [['adm-test', '🧪 测试'] as [string, string]] : []),
    ['adm-logs', '📝 日志'],
  ];
  function go(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  return (
    <div className="page" style={{ paddingBottom: 92 }}>
      <div className="hero" style={{ paddingTop: 8 }}>
        <h1 style={{ fontSize: 24 }}>管理后台</h1>
        <p>{isSuper ? '超 级 管 理 员' : '管 理 员'}</p>
      </div>
      {msg && <p className="card" style={{ padding: 12 }}>{msg}</p>}

      <div className="row" id="adm-overview" style={{ gap: 10, scrollMarginTop: 60 }}>
        {[['成员', members.length], ['已加入', members.filter(x => x.joined).length],
          ['动态', stats.posts], ['照片', stats.photos]].map(([l, n]) => (
          <div key={l as string} className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 4px', margin: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{n}</div>
            <div className="mut" style={{ fontSize: 12 }}>{l}</div>
          </div>
        ))}
      </div>

      {(todoFb > 0 || todoGame > 0 || todoJoin > 0) && (
        <div className="adm-sec card" style={{ borderColor: '#ffd47955' }}>
          <h3>🔔 待办事项</h3>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {todoFb > 0 && <button className="mini" onClick={() => go('adm-feedback')}>💬 {todoFb} 条反馈未处理</button>}
            {todoGame > 0 && <button className="mini" onClick={() => go('adm-game')}>🎮 {todoGame} 个段位待审核</button>}
            {todoJoin > 0 && <button className="mini" onClick={() => go('adm-members')}>👥 {todoJoin} 人未加入班级</button>}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
        <div className="adm-sec card" style={{ flex: 1, minWidth: 0 }}>
          <h3>📈 近14天注册</h3>
          <div className="row" style={{ gap: 3, alignItems: 'flex-end', height: 64, flexWrap: 'nowrap' }}>
            {trend.map(d => (
              <div key={d.k} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${d.k}：${d.n} 人`}>
                <div style={{
                  width: '70%', height: `${Math.max(4, (d.n / trendMax) * 44)}px`, borderRadius: 3,
                  background: d.n > 0 ? 'linear-gradient(180deg,#ffffff,#d9deef)' : '#ffffff18',
                }} />
                <div className="mut" style={{ fontSize: 8.5, marginTop: 3 }}>{d.label.slice(3)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="adm-sec card" style={{ flex: 1, minWidth: 0 }}>
          <h3>🟢 当前在线（{onlineList.length}）</h3>
          {onlineList.length === 0
            ? <p className="mut" style={{ fontSize: 12.5, margin: 0 }}>近15分钟没人活跃</p>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {onlineList.map(m => (
                <span key={m.id} className="mini ghost" style={{ fontSize: 12 }}>{m.display_name || m.username}</span>
              ))}
            </div>}
        </div>
      </div>

      <div className="adm-sec card" id="adm-board" style={{ scrollMarginTop: 60 }}>
        <h3>📢 公告管理</h3>
        <p className="priv-note" style={{ margin: '0 0 8px' }}>公告只有管理员能发布，会置顶显示在公告板最上面，普通成员只能看和留言。</p>
        <textarea value={noticeText} onChange={e => setNoticeText(e.target.value)} rows={3} maxLength={500}
          placeholder="写公告…" style={{ width: '100%' }} />
        <div style={{ marginTop: 8 }}>
          <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={postNotice}>📢 发布公告</button>
        </div>
        {notices.map(n => (
          <div key={n.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{n.content}
              <br /><span className="mut" style={{ fontSize: 12 }}>{(n.created_at || '').slice(0, 16).replace('T', ' ')}</span></span>
            <button className="mini danger" onClick={() => delNotice(n.id)}>删除</button>
          </div>
        ))}
      </div>

      <div className="adm-sec card" id="adm-members" style={{ scrollMarginTop: 60 }}>
        <h3>成员管理（{shown.length} 人）</h3>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input placeholder="🔍 搜索名字 / 用户名 / 真实姓名 / 邮箱" value={q} onChange={e => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 0, marginBottom: 0 }} />
          <button className="mini" onClick={exportCSV}>📥 导出通讯录</button>
        </div>
        <table className="tbl"><thead><tr><th>成员</th><th>邮箱</th><th>角色</th><th>状态</th><th></th></tr></thead>
          <tbody>{shown.map(mb => (
            <tr key={mb.id}>
              <td>{mb.display_name || mb.username}<br /><span className="mut" style={{ fontSize: 12 }}>@{mb.username}{mb.real_name ? ` · ${mb.real_name}` : ''}</span>
                {presence[mb.id] && (presence[mb.id].location || presence[mb.id].device) && (
                  <><br /><span className="mut" style={{ fontSize: 11 }}>
                    {presence[mb.id].location ? `📍${presence[mb.id].location}` : ''}
                    {presence[mb.id].location && presence[mb.id].device ? ' · ' : ''}
                    {presence[mb.id].device ? `📱${presence[mb.id].device}` : ''}
                  </span></>)}</td>
              <td style={{ fontSize: 12 }}>{emails[mb.id] ?? '—'}</td>
              <td><span className={`chip ${mb.role === 'super_admin' ? 'sa' : mb.role === 'admin' ? 'ad' : ''}`}>{ROLE_LABEL[mb.role] ?? mb.role}</span></td>
              <td style={{ fontSize: 13 }}>{mb.joined ? '已加入' : '未加入'}</td>
              <td>{isSuper && mb.id !== me && mb.role !== 'super_admin' && (
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button className="mini" onClick={() => startEdit(mb)}>编辑资料</button>
                  {mb.role === 'admin'
                    ? <button className="mini" onClick={() => changeRole(mb.id, 'member')}>降为成员</button>
                    : <button className="mini" onClick={() => changeRole(mb.id, 'admin')}>设为管理员</button>}
                  <button className="mini" onClick={() => toggleJoined(mb.id, !mb.joined)}>{mb.joined ? '移出班级' : '恢复'}</button>
                  {mb.id !== me && <button className="mini danger" onClick={() => delMember(mb.id, mb.display_name || mb.username)}>删除</button>}
                </span>
              )}
              {editId === mb.id && (
                <div style={{ marginTop: 8, padding: 10, border: '1px solid #ffffff22', borderRadius: 10, background: '#ffffff08' }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <input placeholder="显示名" value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))} style={{ flex: '1 1 100px', minWidth: 0 }} />
                    <input placeholder="真实姓名" value={editForm.real_name} onChange={e => setEditForm(f => ({ ...f, real_name: e.target.value }))} style={{ flex: '1 1 100px', minWidth: 0 }} />
                  </div>
                  <input placeholder="个性签名" value={editForm.signature} onChange={e => setEditForm(f => ({ ...f, signature: e.target.value }))} style={{ marginTop: 8 }} />
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="mini" onClick={saveEdit}>保存</button>
                    <button className="mini ghost" onClick={() => setEditId(null)}>取消</button>
                  </div>
                </div>
              )}</td>
            </tr>
          ))}</tbody></table>
      </div>

      <div className="adm-sec card" id="adm-invite" style={{ scrollMarginTop: 60 }}>
        <h3>🎟️ 邀请码管理</h3>
        <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span className="mut" style={{ fontSize: 12.5 }}>批量生成：</span>
          <button className="mini" disabled={batchBusy} onClick={() => batchCodes(10)}>10 个</button>
          <button className="mini" disabled={batchBusy} onClick={() => batchCodes(20)}>20 个</button>
          <button className="mini" disabled={batchBusy} onClick={() => batchCodes(50)}>50 个</button>
        </div>
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

      <div className="adm-sec card" id="adm-feedback" style={{ scrollMarginTop: 60 }}>
        <h3>💬 反馈管理（{todoFb} 条未处理）</h3>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          {([['all', '全部'], ['open', '未处理'], ['done', '已处理']] as [string, string][]).map(([k, l]) => (
            <button key={k} className={'mini' + (fbFilter === k ? '' : ' ghost')} onClick={() => setFbFilter(k)}>{l}</button>
          ))}
        </div>
        {fbShown.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无反馈</p>}
        {fbShown.map(f => (
          <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid #ffffff0c', opacity: f.status === 'done' ? 0.55 : 1 }}>
            <div style={{ fontSize: 13.5 }}>
              <span className="mut" style={{ fontSize: 11.5, marginRight: 6 }}>
                {f.kind === 'login' ? '🔑 登录反馈' : '💬 意见反馈'} · {(f.created_at || '').slice(0, 16).replace('T', ' ')}
              </span>
              {(f.name || f.contact) && <span className="mut" style={{ fontSize: 12 }}> — {f.name ?? ''}{f.name && f.contact ? ' / ' : ''}{f.contact ?? ''}</span>}
              {f.status === 'done' && <span style={{ fontSize: 11.5, color: '#7ee2a8', marginLeft: 6 }}>✓ 已处理</span>}
            </div>
            <div style={{ fontSize: 14, margin: '4px 0 8px' }}>{f.content}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="mini ghost" onClick={() => markFb(f.id, f.status !== 'done')}>
                {f.status === 'done' ? '标为未处理' : '标为已处理'}</button>
              {f.user_id && (
                <button className="mini" onClick={() => {
                  if (replyOpen === f.id) { setReplyOpen(null); return; }
                  setReplyOpen(f.id);
                  setReplyText(t => t[f.id] ? t : { ...t, [f.id]: `关于你的反馈「${(f.content || '').slice(0, 24)}${(f.content || '').length > 24 ? '…' : ''}」，处理结果：` });
                }}>💬 给提交人发消息</button>)}
              {isSuper && <button className="mini danger" onClick={() => delFb(f.id)}>删除</button>}
            </div>
            {replyOpen === f.id && (
              <div style={{ marginTop: 8 }}>
                <textarea value={replyText[f.id] || ''} onChange={e => setReplyText({ ...replyText, [f.id]: e.target.value })}
                  rows={3} maxLength={2000} placeholder="告诉提交人处理结果…" style={{ width: '100%' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button className="mini" disabled={replyBusy} onClick={() => sendReply(f)}>
                    {replyBusy ? '发送中…' : '发送'}</button>
                  <button className="mini ghost" onClick={() => setReplyOpen(null)}>取消</button>
                </div>
                <p className="mut" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  发给 {nameOf(f.user_id!)}，对方在「好友 - 聊天」里能看到
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="adm-sec card" id="adm-game" style={{ scrollMarginTop: 60 }}>
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

      <div className="adm-sec card" id="adm-content" style={{ scrollMarginTop: 60 }}>
        <h3>🖼️ 内容管理</h3>
        <p className="mut" style={{ fontSize: 12.5, margin: '0 0 6px' }}>班级动态</p>
        {posts.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无动态</p>}
        {posts.map(p => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <span style={{ fontSize: 13.5 }}>{nameOf(p.author_id)}：{(p.content || '').slice(0, 40)}{(p.content || '').length > 40 ? '…' : ''}
              <br /><span className="mut" style={{ fontSize: 12 }}>{(p.created_at || '').slice(0, 16).replace('T', ' ')}</span></span>
            <button className="mini danger" onClick={() => delPost(p.id)}>删除</button>
          </div>
        ))}
        <p className="mut" style={{ fontSize: 12.5, margin: '14px 0 6px' }}>班级相册</p>
        {albums.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无相册</p>}
        {albums.map(a => (
          <div key={a.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <span style={{ fontSize: 13.5 }}>{a.title} · {a.category}</span>
            <button className="mini danger" onClick={() => delAlbum(a.id)}>删除</button>
          </div>
        ))}
      </div>

      <div className="adm-sec card" id="adm-search" style={{ scrollMarginTop: 60 }}>
        <h3>🔍 全站搜索</h3>
        <input placeholder="搜成员 / 动态 / 相册 / 反馈 / 公告…" value={gq} onChange={e => setGq(e.target.value)}
          style={{ marginBottom: 10 }} />
        {searchRes && (
          <div style={{ fontSize: 13.5 }}>
            {searchRes.members.length > 0 && (<>
              <p className="mut" style={{ fontSize: 12.5, margin: '8px 0 4px' }}>成员（{searchRes.members.length}）</p>
              {searchRes.members.map(m => <div key={m.id} style={{ padding: '4px 0' }}>{m.display_name || m.username} <span className="mut">@{m.username}</span></div>)}
            </>)}
            {searchRes.posts.length > 0 && (<>
              <p className="mut" style={{ fontSize: 12.5, margin: '8px 0 4px' }}>动态（{searchRes.posts.length}）</p>
              {searchRes.posts.slice(0, 10).map(p => <div key={p.id} style={{ padding: '4px 0' }}>{nameOf(p.author_id)}：{(p.content || '').slice(0, 40)}</div>)}
            </>)}
            {searchRes.albums.length > 0 && (<>
              <p className="mut" style={{ fontSize: 12.5, margin: '8px 0 4px' }}>相册（{searchRes.albums.length}）</p>
              {searchRes.albums.map(a => <div key={a.id} style={{ padding: '4px 0' }}>{a.title} · {a.category}</div>)}
            </>)}
            {searchRes.feedbacks.length > 0 && (<>
              <p className="mut" style={{ fontSize: 12.5, margin: '8px 0 4px' }}>反馈（{searchRes.feedbacks.length}）</p>
              {searchRes.feedbacks.slice(0, 10).map(f => <div key={f.id} style={{ padding: '4px 0' }}>{(f.content || '').slice(0, 40)}</div>)}
            </>)}
            {searchRes.notices.length > 0 && (<>
              <p className="mut" style={{ fontSize: 12.5, margin: '8px 0 4px' }}>公告（{searchRes.notices.length}）</p>
              {searchRes.notices.map(n => <div key={n.id} style={{ padding: '4px 0' }}>{n.content.slice(0, 40)}</div>)}
            </>)}
            {Object.values(searchRes).every(a => a.length === 0) && <p className="mut">没搜到相关内容</p>}
          </div>
        )}
      </div>

      <div className="adm-sec card" id="adm-export" style={{ scrollMarginTop: 60 }}>
        <h3>💾 数据导出</h3>
        <p className="priv-note" style={{ margin: '0 0 8px' }}>把网站内容打包下载，留个备份。</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="mini" onClick={exportJSON}>导出内容备份（JSON）</button>
          <button className="mini" onClick={exportCSV}>导出通讯录（CSV）</button>
        </div>
      </div>

      {isSuper && (
        <div className="adm-sec card" id="adm-test" style={{ scrollMarginTop: 60 }}>
          <h3>🧪 测试工具</h3>
          <p className="priv-note" style={{ margin: '0 0 8px' }}>测试账号快切：保存测试账号，一键切换登录，方便测试。密码只存这台手机的浏览器里。建议把管理号也存进来，切出去后右下角会有"结束测试"一键切回。</p>
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

      <div className="adm-sec card" id="adm-logs" style={{ scrollMarginTop: 60 }}>
        <h3>📝 操作日志</h3>
        <input placeholder="🔍 筛选操作，如：delete_member" value={logQ} onChange={e => setLogQ(e.target.value)}
          style={{ marginBottom: 10 }} />
        {logShown.length === 0 && <p className="mut" style={{ fontSize: 13 }}>暂无记录</p>}
        {logShown.map(l => (
          <div key={l.id} className="log">
            {(l.created_at ?? '').slice(0, 16).replace('T', ' ')} · {l.action} · {JSON.stringify(l.detail ?? {})}
          </div>
        ))}
      </div>

      {/* 底部导航：悬浮小药丸，和主站底栏一样 */}
      <div style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 60,
        bottom: 'calc(14px + env(safe-area-inset-bottom))',
        width: 'max-content', maxWidth: 'calc(100vw - 28px)',
        padding: 6, borderRadius: 999,
        background: 'color-mix(in srgb,#1a1e30 38%,transparent)',
        backdropFilter: 'blur(30px) saturate(1.8)', WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
        border: '1px solid #ffffff2e',
        boxShadow: '0 14px 44px #000c,inset 0 1px 0 #ffffff2b',
      }}>
        <div className="row" style={{ gap: 2, overflowX: 'auto', flexWrap: 'nowrap', maxWidth: '100%' }}>
          {NAV.map(([id, label]) => (
            <button key={id} onClick={() => go(id)} style={{
              flexShrink: 0, whiteSpace: 'nowrap', padding: '9px 13px', borderRadius: 999,
              background: 'none', border: 0, color: 'var(--mut)', fontSize: 13, cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
