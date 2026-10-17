import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type Member = { id: string; username: string; display_name: string | null; real_name: string | null; role: string; joined: boolean; created_at: string };
type Log = { id: number; action: string; detail: unknown; created_at: string };
type Post = { id: number; content: string; author_id: string; created_at: string };
type Alb = { id: number; title: string; category: string; created_at: string };

const ROLE_LABEL: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', member: '成员' };

export default function Admin() {
  const me = useAuth().session!.user.id;
  const [role, setRole] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [albums, setAlbums] = useState<Alb[]>([]);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => { supabase.rpc('my_role').then(({ data }) => setRole(data ?? '')); }, []);

  async function refresh() {
    const m = await supabase.from('profiles')
      .select('id, username, display_name, real_name, role, joined, created_at').order('created_at');
    if (!m.error) setMembers(m.data as Member[]);
    const s = await supabase.from('app_settings').select('invite_code').eq('id', 1).maybeSingle();
    if (!s.error && s.data) setCode(s.data.invite_code ?? '');
    const l = await supabase.from('admin_audit_logs')
      .select('id, action, detail, created_at').order('created_at', { ascending: false }).limit(50);
    if (!l.error) setLogs(l.data as Log[]);
    const p = await supabase.from('posts').select('id, content, author_id, created_at')
      .order('created_at', { ascending: false }).limit(30);
    if (!p.error) setPosts(p.data as Post[]);
    const a = await supabase.from('albums').select('id, title, category, created_at')
      .order('created_at', { ascending: false }).limit(30);
    if (!a.error) setAlbums(a.data as Alb[]);
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
  async function saveCode() {
    setMsg('');
    const { error } = await supabase.rpc('set_invite_code', { new_code: code.trim() });
    setMsg(error ? '保存失败：' + error.message : '邀请码已更新');
  }
  async function delPost(id: number) {
    if (!confirm('删除这条动态（含评论点赞）？')) return;
    await supabase.from('posts').delete().eq('id', id); refresh();
  }
  async function delAlbum(id: number) {
    if (!confirm('删除这个相册（含所有照片）？')) return;
    await supabase.from('albums').delete().eq('id', id); refresh();
  }

  return (
    <div className="page">
      <div className="hero" style={{ paddingTop: 8 }}>
        <h1 style={{ fontSize: 24 }}>管理后台</h1>
        <p>{isSuper ? '超 级 管 理 员' : '管 理 员'}</p>
      </div>
      {msg && <p className="card" style={{ padding: 12 }}>{msg}</p>}

      <div className="adm-sec card">
        <h3>成员管理（{members.length} 人）</h3>
        <table className="tbl"><thead><tr><th>成员</th><th>角色</th><th>状态</th><th></th></tr></thead>
          <tbody>{members.map(mb => (
            <tr key={mb.id}>
              <td>{mb.display_name || mb.username}<br /><span className="mut" style={{ fontSize: 12 }}>@{mb.username}{mb.real_name ? ` · ${mb.real_name}` : ''}</span></td>
              <td><span className={`chip ${mb.role === 'super_admin' ? 'sa' : mb.role === 'admin' ? 'ad' : ''}`}>{ROLE_LABEL[mb.role] ?? mb.role}</span></td>
              <td style={{ fontSize: 13 }}>{mb.joined ? '已加入' : '未加入'}</td>
              <td>{isSuper && mb.id !== me && mb.role !== 'super_admin' && (
                mb.role === 'admin'
                  ? <button className="mini" onClick={() => changeRole(mb.id, 'member')}>降为成员</button>
                  : <button className="mini" onClick={() => changeRole(mb.id, 'admin')}>设为管理员</button>
              )}</td>
            </tr>
          ))}</tbody></table>
      </div>

      <div className="adm-sec card">
        <h3>班级邀请码</h3>
        {isSuper ? (
          <div className="row" style={{ gap: 8 }}>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="邀请码" style={{ maxWidth: 220 }} />
            <button className="pri" style={{ width: 'auto', padding: '10px 24px' }} onClick={saveCode}>保存</button>
          </div>
        ) : <p className="mut">邀请码仅超级管理员可查看和修改</p>}
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
