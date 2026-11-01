import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Person = { id: string; username: string | null; display_name: string | null; real_name: string | null };
type Campaign = { id: number; subject: string; selected_count: number; sent_count: number; failed_count: number; no_email_count: number; provider_failure_count: number; status: string; created_at: string; completed_at: string | null; actor_name: string };
export default function AdminBulkEmail({ setMsg }: { setMsg: (s: string) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
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
  // 邮箱在登录账号里、不在 profiles 表：复用账号管理页的管理员 RPC 取邮箱，
  // 显示在名字下方；取不到时静默回退显示用户名，不影响勾选和发送。
  useEffect(() => {
    let live = true;
    supabase.rpc('admin_member_accounts').then(({ data, error }) => {
      if (!live || error || !Array.isArray(data)) return;
      const map: Record<string, string> = {};
      (data as any[]).forEach(r => { if (r?.id && r?.email) map[r.id] = r.email; });
      setEmails(map);
    });
    return () => { live = false; };
  }, []);
  async function loadHistory() {
    setHistoryLoading(true);
    const { data, error } = await supabase.rpc('admin_email_campaign_history');
    if (error) {
      setMsg('邮件历史读取失败：' + error.message);
      setHistory([]);
    } else {
      setHistory(Array.isArray(data) ? data as Campaign[] : []);
    }
    setHistoryLoading(false);
  }
  useEffect(() => { void loadHistory(); }, []);
  // 收件人或内容变化时，取消待确认状态，避免误发。
  useEffect(() => { setConfirming(false); }, [selected, subject, body]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(p => !q || [p.username,p.display_name,p.real_name,p.id,emails[p.id]].some(v => (v || '').toLowerCase().includes(q)));
  }, [people, query, emails]);
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
    if (!confirming) {
      setConfirming(true);
      setMsg(`已选择 ${selected.length} 个账号，再点一次「确认发送」就会发出，发送后无法撤回；改动收件人或内容可取消确认。`);
      return;
    }
    setConfirming(false);
    setBusy(true); setMsg('正在发送邮件，请不要关闭页面…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('登录状态已失效，请重新登录。');
      const { data: result, error: invokeError } = await supabase.functions.invoke('admin-bulk-email', {
        body: { userIds: selected, subject: subject.trim(), text: body.trim() },
      });
      if (invokeError) throw new Error(invokeError.message || '发送失败。请检查邮件服务配置。');
      if (result?.error) throw new Error(result.error || '发送失败。请检查邮件服务配置。');
      setMsg(`发送任务完成：已提交 ${result.sent || 0} 封，未提交 ${result.failed || 0} 封。${result.detail ? '失败原因：' + result.detail : ''}`);
      setSelected([]);
      await loadHistory();
    } catch (e: any) { setMsg(e.message || '发送失败。'); }
    finally { setBusy(false); }
  }
  return <section className="admin-email-glass" style={{ color: '#eef1ff' }}>
    <div className="admin-email-panel" style={panel}>
      <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>批量发送邮件</h2>
      <p style={{ color: '#9da6c3', fontSize: 11, lineHeight: 1.65, margin: '0 0 12px' }}>搜索并勾选收件账号，再填写邮件标题和正文。系统会逐个发送，不会把其他收件人的邮箱地址暴露给彼此。每次最多 100 个账号。</p>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索昵称、姓名或用户名…" style={field} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '9px 0', gap: 8 }}>
        <span style={{ color: '#b9c2dd', fontSize: 11 }}>已选择 {selected.length} 个账号</span>
        <button onClick={toggleVisible} style={small}>{filtered.length && filtered.every(p => selected.includes(p.id)) ? '取消选择当前列表' : '选择当前列表'}</button>
      </div>
      <div style={{ maxHeight: 190, overflowY: 'auto', border: '1px solid #ffffff12', borderRadius: 10, padding: '3px 9px' }}>
        {loading ? <p style={muted}>加载成员中…</p> : filtered.map(p => <label key={p.id} style={person}>
          <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
          <span style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', fontSize: 12 }}>{p.display_name || p.real_name || p.username || '未命名账号'}</b><small style={{ color: '#8994b2', fontSize: 10, display: 'block', overflowWrap: 'anywhere' }}>{emails[p.id] || p.username || p.id.slice(0,8)}</small></span>
        </label>)}
        {!loading && !filtered.length && <p style={muted}>没有匹配的账号。</p>}
      </div>
      <label style={label}>邮件标题</label>
      <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={160} placeholder="例如：班级活动通知" style={field} />
      <label style={label}>邮件内容</label>
      <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={10000} rows={6} placeholder="写下邮件正文…" style={{ ...field, resize: 'vertical' }} />
      <button className={`admin-email-send-button${confirming ? ' is-confirming' : ''}`} disabled={busy} onClick={() => void send()} style={{ ...sendBtn, opacity: busy ? .6 : 1 }}>{busy ? '发送中…' : confirming ? `确认发送？将发送给 ${selected.length} 个账号` : `发送给已选择的 ${selected.length} 个账号`}</button>
      <p style={{ color: '#8994b2', fontSize: 10, lineHeight: 1.6, marginBottom: 0 }}>只向你明确勾选的账号发送；请勿发送骚扰、敏感或与社区无关的邮件。发送记录只保存邮件主题、数量和状态，不保存正文或邮箱地址。</p>
    </div>
    <div className="admin-email-panel" style={{ ...panel, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>最近发送记录</h2>
          <p style={{ color: '#9da6c3', fontSize: 10.5, margin: 0 }}>最近 30 次邮件任务；记录不代表收件箱最终送达。</p>
        </div>
        <button style={small} disabled={historyLoading} onClick={() => void loadHistory()}>{historyLoading ? '刷新中…' : '刷新'}</button>
      </div>
      {historyLoading && !history.length && <p style={muted}>正在读取发送记录…</p>}
      {!historyLoading && !history.length && <p style={muted}>暂无邮件发送记录。</p>}
      {history.map(item => {
        const statusText = item.status === 'completed' ? '全部已提交给服务商' : item.status === 'partial' ? '部分提交失败' : item.status === 'failed' ? '发送失败' : '处理中';
        const statusColor = item.status === 'completed' ? '#7ed9b0' : item.status === 'processing' ? '#f5c26b' : '#ff9da7';
        return <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #ffffff10' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <strong style={{ fontSize: 12.5, minWidth: 0, overflowWrap: 'anywhere' }}>{item.subject}</strong>
            <span style={{ color: statusColor, fontSize: 10.5, flexShrink: 0 }}>{statusText}</span>
          </div>
          <div style={{ color: '#9da6c3', fontSize: 10.5, marginTop: 4 }}>
            #{item.id} · {new Date(item.created_at).toLocaleString()} · {item.actor_name}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#c6d0e9', fontSize: 11, marginTop: 6 }}>
            <span>选中 {item.selected_count}</span>
            <span style={{ color: '#7ed9b0' }}>已提交 {item.sent_count}</span>
            <span style={{ color: item.failed_count ? '#ff9da7' : '#9da6c3' }}>失败 {item.failed_count}</span>
            {item.no_email_count > 0 && <span>无邮箱 {item.no_email_count}</span>}
            {item.provider_failure_count > 0 && <span>服务商失败 {item.provider_failure_count}</span>}
          </div>
        </div>;
      })}
    </div>
  </section>;
}
const panel: React.CSSProperties = { background: 'linear-gradient(145deg,#171e33,#0d1222)', border: '1px solid #ffffff18', borderRadius: 20, padding: 12 };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#080d1c', border: '1px solid #ffffff20', borderRadius: 12, padding: '8px 10px', color: '#fff', font: 'inherit', fontSize: 12, outline: 'none' };
const label: React.CSSProperties = { display: 'block', color: '#b9c2dd', fontSize: 10.5, margin: '8px 0 4px' };
const small: React.CSSProperties = { border: '1px solid #ffffff20', borderRadius: 999, padding: '6px 9px', background: '#ffffff0c', color: '#dfe4f7', fontSize: 10, cursor: 'pointer' };
const sendBtn: React.CSSProperties = { width: '100%', marginTop: 12, border: 0, borderRadius: 999, padding: '9px 12px', background: 'linear-gradient(135deg,#5b8cff,#8b5cf6)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' };
const person: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', borderBottom: '1px solid #ffffff0c', cursor: 'pointer' };
const muted: React.CSSProperties = { color: '#9da6c3', fontSize: 11, textAlign: 'center', padding: 10 };
