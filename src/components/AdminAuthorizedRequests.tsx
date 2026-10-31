import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { confirmDialog } from '../lib/dialog';

type Item = {
  id: string; profile_id: string; request_date: string; request_type: string;
  description: string; contact: string | null; status: string; created_at: string;
};
const LABEL: Record<string, string> = {
  selected: '今日处理中', pending: '候选中', not_found: '未找到', completed: '已完成',
};

export default function AdminAuthorizedRequests({ setMsg }: { setMsg: (s: string) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    const { data, error: e } = await (supabase as any).from('authorized_request_queue')
      .select('id,profile_id,request_date,request_type,description,contact,status,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (e) setError('读取队列失败：' + e.message);
    else { setError(''); setItems((data || []) as Item[]); }
  }
  useEffect(() => { void load(); }, []);

  async function resolve(item: Item, found: boolean) {
    const prompt = found ? '确认将这项申请标记为已完成？' : '确认标记为未找到，并通知申请人、递补下一位？';
    if (!(await confirmDialog(prompt, { danger: !found }))) return;
    setBusy(item.id); setError('');
    const { data, error: e } = await (supabase as any).rpc('admin_resolve_authorized_request', {
      p_request_id: item.id, p_found: found,
    });
    setBusy(null);
    if (e) { setError('处理失败：' + e.message); return; }
    setMsg(data?.message || (found ? '申请已完成。' : '已标记未找到并处理递补。'));
    await load();
  }

  return <section style={{ display: 'grid', gap: 12, color: '#e8edff' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <div><h2 style={{ margin: 0, fontSize: 18 }}>开盒申请队列</h2><p style={{ margin: '5px 0 0', color: '#8995b4', fontSize: 12 }}>按提交时间排序 · 每日最多完成一项</p></div>
      <button className="mini" onClick={() => void load()}>刷新</button>
    </header>
    {error && <p role="alert" style={{ color: '#ff9b9b', fontSize: 12 }}>{error}</p>}
    {items.length === 0 && !error && <div style={{ padding: 18, borderRadius: 14, background: '#ffffff0b', color: '#98a4c2', fontSize: 13 }}>暂无申请。</div>}
    {items.map(item => <article key={item.id} style={{ padding: 14, borderRadius: 16, border: '1px solid #ffffff18', background: '#ffffff0a', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>{item.request_type}</strong>
        <span style={{ fontSize: 11, color: item.status === 'selected' ? '#9ec5ff' : '#aab4ce' }}>{LABEL[item.status] || item.status}</span>
      </div>
      <div style={{ color: '#c6cde0', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{item.description}</div>
      <div style={{ color: '#8995b4', fontSize: 11, lineHeight: 1.6 }}>
        提交：{new Date(item.created_at).toLocaleString()} · 日期：{item.request_date}<br />
        申请人：{item.profile_id.slice(0, 8)}…{item.contact ? ' · 联系方式：' + item.contact : ''}
      </div>
      {item.status === 'selected' && <div style={{ display: 'flex', gap: 8 }}>
        <button className="mini" disabled={busy === item.id} onClick={() => void resolve(item, false)}>未找到 / 递补</button>
        <button className="mini" disabled={busy === item.id} onClick={() => void resolve(item, true)}>标记完成</button>
      </div>}
    </article>)}
  </section>;
}
