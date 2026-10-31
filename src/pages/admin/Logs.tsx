import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut } from './shared';

type Log = { id: number; action: string; detail: unknown; created_at: string };

export default function Logs() {
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
          <div style={{ marginTop: 6, display: 'grid', gap: 5 }}>
            {Object.entries((() => {
              let value: any = l.detail ?? {};
              if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return { 内容: value }; } }
              if (value && typeof value === 'object' && !Array.isArray(value)) return value;
              return { 内容: Array.isArray(value) ? value.join('、') : String(value ?? '—') };
            })()).map(([key, value]) => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(76px, 110px) minmax(0, 1fr)', gap: 8, lineHeight: 1.55 }}>
                <span style={mut}>{key}</span>
                <span style={{ color: '#d7dce5', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—')}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {shown.length === 0 && <p style={mut}>暂无记录</p>}
      <p style={{ ...mut, marginTop: 10 }}>日志仅管理员可见，不可删除或修改。</p>
    </div>
  );
}
