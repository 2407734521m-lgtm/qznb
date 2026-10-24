import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

/** 愿望墙：班级共同愿望 */
export default function Wishes() {
  const me = useAuth().session!.user.id;
  const [list, setList] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.from('wishes').select('*').order('created_at', { ascending: false }).limit(100);
    setList(data ?? []);
    const ids = [...new Set((data ?? []).map((x: any) => x.author_id).filter(Boolean))];
    if (ids.length) {
      const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 100, skip: 0 });
      const mp: Record<string, string> = {};
      ((dir ?? []) as any[]).forEach((x: any) => { if (ids.includes(x.id)) mp[x.id] = x.display_name || x.username || '暂未填写'; });
      setNames(mp);
    }
  }
  useEffect(() => { load(); }, []);

  async function post() {
    const c = text.trim(); if (!c) return;
    const { error } = await supabase.from('wishes').insert({ author_id: me, content: c.slice(0, 300) });
    if (error) setMsg('发布失败：' + error.message);
    else { setText(''); load(); }
  }
  async function del(id: number) {
    if (!confirm('删除这条愿望？')) return;
    await supabase.from('wishes').delete().eq('id', id);
    load();
  }

  // 瀑布流式愿望卡片
  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      <div className="hero"><h1>愿望墙</h1><p>写 下 共 同 的 愿 望</p></div>
      <div className="card">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="我的愿望是…" rows={3} maxLength={300} style={{ width: '100%', marginBottom: 8 }} />
        <button className="pri" onClick={post}>许愿</button>
        {msg && <p className="err" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
      <div style={{ columns: 2, columnGap: 10 }}>
        {list.map(w => (
          <div key={w.id} className="card" style={{ breakInside: 'avoid', marginBottom: 10, background: 'linear-gradient(135deg,#ffd47918,#ff9ec618)' }}>
            <p style={{ fontSize: 14, margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{w.content}</p>
            <div style={{ fontSize: 11.5, color: 'var(--mut)' }}>— {names[w.author_id] || '同学'}</div>
            {(w.author_id === me) && <button className="mini ghost" style={{ marginTop: 6 }} onClick={() => del(w.id)}>删除</button>}
          </div>
        ))}
      </div>
      {list.length === 0 && <div className="center"><div className="card">还没有愿望，来许第一个吧</div></div>}
    </div>
  );
}
