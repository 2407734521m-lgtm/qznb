import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';

type MyFeedbackItem = {
  id: number;
  kind: string;
  content: string;
  status: 'open' | 'in_progress' | 'done' | string;
  admin_note: string | null;
  created_at: string;
  handled_at: string | null;
};

const statusLabel: Record<string, string> = {
  open: '待处理',
  in_progress: '处理中',
  done: '已处理',
};
const statusColor: Record<string, string> = {
  open: '#d79a3b',
  in_progress: '#75a8ff',
  done: '#3cae79',
};

export default function MeFeedback() {
  const me = useAuth().session?.user.id ?? '';
  const [items, setItems] = useState<MyFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.from('feedbacks')
      .select('id, kind, content, status, admin_note, created_at, handled_at')
      .eq('user_id', me)
      .order('created_at', { ascending: false })
      .limit(50);
    if (queryError) {
      setError('反馈记录暂时无法读取，请稍后重试。');
      setItems([]);
    } else {
      setItems((data ?? []) as MyFeedbackItem[]);
    }
    setLoading(false);
  }, [me]);

  useEffect(() => { void load(); }, [load]);

  return <main className="page" style={{ paddingBottom: 110 }}>
    <BackButton fallback="/me" />
    <section className="card" style={{ padding: 16, marginBottom: 12 }}>
      <h2 style={{ margin: '2px 0 5px', fontSize: 20 }}>我的反馈</h2>
      <p className="mut" style={{ margin: 0, fontSize: 12.5 }}>查看你提交的问题、处理进度和管理员回复。</p>
      <button className="mini ghost" style={{ marginTop: 12 }} onClick={() => void load()} disabled={loading}>
        {loading ? '刷新中…' : '刷新记录'}
      </button>
    </section>

    {loading && <section className="card" style={{ textAlign: 'center', padding: 28 }}>正在读取反馈记录…</section>}
    {!loading && error && <section className="card" role="alert">{error}</section>}
    {!loading && !error && items.length === 0 && <section className="card" style={{ textAlign: 'center', padding: 28 }}>
      <div style={{ fontWeight: 700 }}>还没有反馈记录</div>
      <p className="mut" style={{ fontSize: 12 }}>提交意见或登录问题后，可以在这里查看处理进度。</p>
    </section>}
    {!loading && !error && items.map(item => {
      const color = statusColor[item.status] || '#98a8c5';
      return <article key={item.id} className="card" style={{ marginBottom: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--mut)', fontSize: 11.5 }}>{item.kind === 'login' ? '登录问题反馈' : '意见反馈'} · {new Date(item.created_at).toLocaleString()}</span>
          <span style={{ color, border: '1px solid ' + color + '55', background: color + '18', borderRadius: 999, padding: '3px 8px', fontSize: 10.5, fontWeight: 750 }}>
            {statusLabel[item.status] || item.status}
          </span>
        </div>
        <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.content}</div>
        {item.admin_note && <div style={{ marginTop: 12, padding: 11, borderRadius: 11, background: 'rgba(80,140,255,.08)', border: '1px solid rgba(120,165,255,.18)' }}>
          <div style={{ fontSize: 11, color: '#8db8ff', fontWeight: 800, marginBottom: 5 }}>管理员处理说明</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.admin_note}</div>
        </div>}
        {item.handled_at && <div className="mut" style={{ fontSize: 10.5, marginTop: 8 }}>处理时间：{new Date(item.handled_at).toLocaleString()}</div>}
      </article>;
    })}
  </main>;
}
