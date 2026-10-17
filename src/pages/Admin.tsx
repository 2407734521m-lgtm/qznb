import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type Member = { id: string; username: string; display_name: string | null; role: string; joined: boolean; created_at: string };
type Log = { id: number; action: string; detail: unknown; created_at: string };

const ROLE_LABEL: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', member: '成员' };

export default function Admin() {
  const me = useAuth().session!.user.id;
  const [role, setRole] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.rpc('my_role').then(({ data }) => setRole(data ?? ''));
  }, []);

  async function refresh() {
    const m = await supabase.from('profiles')
      .select('id, username, display_name, role, joined, created_at').order('created_at');
    if (!m.error) setMembers(m.data as Member[]);
    const s = await supabase.from('app_settings').select('invite_code').eq('id', 1).maybeSingle();
    if (!s.error && s.data) setCode(s.data.invite_code ?? '');
    const l = await supabase.from('admin_audit_logs')
      .select('id, action, detail, created_at').order('created_at', { ascending: false }).limit(50);
    if (!l.error) setLogs(l.data as Log[]);
  }

  useEffect(() => {
    if (role === 'admin' || role === 'super_admin') refresh();
  }, [role]);

  if (role === null) return <div className="center">加载中…</div>;
  if (role !== 'admin' && role !== 'super_admin')
    return <div className="center"><div className="card">无权访问管理后台</div></div>;
  const isSuper = role === 'super_admin';

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

  return (
    <div className="card">
      <h2>管理后台</h2>
      {msg && <p>{msg}</p>}

      <h3>成员管理（{members.length} 人）</h3>
      {members.map(mb => (
        <div key={mb.id} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <span>{mb.display_name || mb.username}（{mb.username}）· {ROLE_LABEL[mb.role] ?? mb.role}{mb.joined ? '' : ' · 未加入'}</span>
          {isSuper && mb.id !== me && mb.role !== 'super_admin' && (
            mb.role === 'admin'
              ? <button onClick={() => changeRole(mb.id, 'member')}>降为成员</button>
              : <button onClick={() => changeRole(mb.id, 'admin')}>设为管理员</button>
          )}
        </div>
      ))}

      <hr />
      <h3>班级邀请码</h3>
      {isSuper ? (
        <div className="row" style={{ gap: 8 }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="邀请码" style={{ maxWidth: 200 }} />
          <button className="pri" onClick={saveCode}>保存</button>
        </div>
      ) : <p>邀请码仅超级管理员可查看和修改</p>}

      <hr />
      <h3>操作日志</h3>
      {logs.length === 0 && <p style={{ fontSize: 13, opacity: 0.7 }}>暂无记录</p>}
      {logs.map(l => (
        <div key={l.id} style={{ fontSize: 13, opacity: 0.85 }}>
          {(l.created_at ?? '').slice(0, 16).replace('T', ' ')} · {l.action} · {JSON.stringify(l.detail ?? {})}
        </div>
      ))}
    </div>
  );
}
