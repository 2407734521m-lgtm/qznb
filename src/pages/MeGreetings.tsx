import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';

/** 我的留言 */
export default function MeGreetings() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [list, setList] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await supabase.from('greetings')
      .select('id, target_id, content, created_at').eq('author_id', me)
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
    const rows = data ?? [];
    setList(rows);
    const ids = [...new Set(rows.map(r => r.target_id).filter((id): id is string => typeof id === 'string' && id.length > 0))];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, display_name, username').in('id', ids);
      const m: Record<string, string> = {};
      (ps ?? []).forEach((p: any) => { m[p.id] = p.display_name || p.username; });
      setNames(m);
    }
  }
  useEffect(() => { load(); }, []);

  async function del(id: number) {
    if (!confirm('删除这条留言？')) return;
    const { error } = await supabase.from('greetings').delete().eq('id', id);
    if (!error) load(); else setMsg('删除失败：' + error.message);
  }

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <BackButton fallback="/me" />
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>我的留言（{list.length}）</h2>
      {msg && <p className="priv-note">{msg}</p>}
      {list.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>
          <div style={{ marginBottom: 10 }}>还没有留过言</div>
          <button className="pri" style={{ width: 'auto', padding: '9px 26px' }} onClick={() => nav('/greetings')}>去留言墙看看</button>
        </div>
      )}
      {list.map(g => (
        <div key={g.id} className="card">
          <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{g.content}</div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>
              → {g.target_id ? (names[g.target_id] || '同学') : '全班'} · {(g.created_at || '').slice(0, 16).replace('T', ' ')}
            </span>
            <button className="mini danger" onClick={() => del(g.id)}>删除</button>
          </div>
        </div>
      ))}
    </div>
  );
}
