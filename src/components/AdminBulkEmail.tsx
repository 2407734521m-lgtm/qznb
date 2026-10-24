import { useEffect, useMemo, useState } from 'react';
import { supabase, supabaseBaseUrl } from '../lib/supabase';

type Person = { id: string; username: string | null; display_name: string | null; real_name: string | null };
export default function AdminBulkEmail({ setMsg }: { setMsg: (s: string) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    supabase.from('profiles').select('id,username,display_name,real_name').order('created_at', { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setMsg('成员列表加载失败。');
        else setPeople((data || []) as Person[]);
        setLoading(false);
      });
    return () => { live = false; };
  }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(p => !q || [p.username,p.display_name,p.real_name,p.id].some(v => (v || '').toLowerCase().includes(q)));
  }, [people, query]);
  function toggle(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  function toggleVisible() {
    const ids = filtered.map(p => p.id);
    const all = ids.length > 0 && ids.every(id => selected.includes(id));
    setSelected(prev => all ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  }
  async function send() {
    if (!selected.length) { setMsg('请先选择收件账号。'); return; }
    if (!subject.trim() || subject.trim().length > 160) { setMsg('邮件标题需填写，且不超过 160 个字。'); return; }
    if (!body.trim() || body.trim().length > 10000) { setMsg('邮件内容需填写，且不超过 10000 个字。'); return; }
    if (selected.length > 100) { setMsg('单次最多选择 100 个账号，请分批发送。'); return; }
    if (!confirm(`确认向 ${selected.length} 个账号发送这封邮件？发送后无法撤回。`)) return;
    setBusy(true); setMsg('正在发送邮件，请不要关闭页面…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('登录状态已失效，请重新登录。');
      const response = await fetch(`${supabaseBaseUrl}/functions/v1/admin-bulk-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}', apikey: (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '' },
        body: JSON.stringify({ userIds: selected, subject: subject.trim(), text: body.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '发送失败。请检查邮件服务配置。');
      setMsg(`发送任务完成：成功 ${result.sent || 0} 封，失败 ${result.failed || 0} 封。`);
      setSelected([]);
    } catch (e: any) { setMsg(e.message || '发送失败。'); }
    finally { setBusy(false); }
  }
  return <section style={{ color: '#eef1ff' }}>
    <div style={panel}>
      <h2 style={{ fontSize: 15, margin: '0 0 5px' }}>批量发送邮件</h2>
      <p style={{ color: '#9da6c3', fontSize: 11, lineHeight: 1.65, margin: '0 0 12px' }}>搜索并勾选收件账号，再填写邮件标题和正文。系统会逐个发送，不会把其他收件人的邮箱地址暴露给彼此。每次最多 100 个账号。</p>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索昵称、姓名或用户名…" style={field} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '9px 0', gap: 8 }}>
        <span style={{ color: '#b9c2dd', fontSize: 11 }}>已选择 {selected.length} 个账号</span>
        <button onClick={toggleVisible} style={small}>{filtered.length && filtered.every(p => selected.includes(p.id)) ? '取消选择当前列表' : '选择当前列表'}</button>
      </div>
      <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid #ffffff12', borderRadius: 10, padding: '3px 9px' }}>
        {loading ? <p style={muted}>加载成员中…</p> : filtered.map(p => <label key={p.id} style={person}>
          <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
          <span style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', fontSize: 12 }}>{p.display_name || p.real_name || p.username || '未命名账号'}</b><small style={{ color: '#8994b2', fontSize: 10 }}>{p.username || p.id.slice(0,8)}</small></span>
        </label>)}
        {!loading && !filtered.length && <p style={muted}>没有匹配的账号。</p>}
      </div>
      <label style={label}>邮件标题</label>
      <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={160} placeholder="例如：平中·青春纪校园社区通知" style={field} />
      <label style={label}>邮件内容</label>
      <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={10000} rows={6} placeholder="写下邮件正文…" style={{ ...field, resize: 'vertical' }} />
      <button disabled={busy} onClick={() => void send()} style={{ ...sendBtn, opacity: busy ? .6 : 1 }}>{busy ? '发送中…' : `发送给已选择的 ${selected.length} 个账号`}</button>
      <p style={{ color: '#8994b2', fontSize: 10, lineHeight: 1.6, marginBottom: 0 }}>只向你明确勾选的账号发送；请勿发送骚扰、敏感或与社区无关的邮件。需要先部署 admin-bulk-email 函数，并配置邮件服务密钥。</p>
    </div>
  </section>;
}
const panel: React.CSSProperties = { background: 'linear-gradient(145deg,#171e33,#0d1222)', border: '1px solid #ffffff18', borderRadius: 14, padding: 13 };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#080d1c', border: '1px solid #ffffff20', borderRadius: 9, padding: '9px 10px', color: '#fff', font: 'inherit', fontSize: 12, outline: 'none' };
const label: React.CSSProperties = { display: 'block', color: '#b9c2dd', fontSize: 11, margin: '10px 0 5px' };
const small: React.CSSProperties = { border: '1px solid #ffffff20', borderRadius: 999, padding: '6px 9px', background: '#ffffff0c', color: '#dfe4f7', fontSize: 10, cursor: 'pointer' };
const sendBtn: React.CSSProperties = { width: '100%', marginTop: 12, border: 0, borderRadius: 999, padding: '10px 12px', background: 'linear-gradient(135deg,#5b8cff,#8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const person: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 2px', borderBottom: '1px solid #ffffff0c', cursor: 'pointer' };
const muted: React.CSSProperties = { color: '#9da6c3', fontSize: 11, textAlign: 'center', padding: 10 };
