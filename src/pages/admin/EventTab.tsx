import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';
import { confirmDialog } from '../../lib/dialog';
import DateTimeField from '../../components/DateTimeField';

export default function EventTab({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [at, setAt] = useState('');
  const [loc, setLoc] = useState('');
  async function load() {
    const { data } = await supabase.from('events').select('*').order('event_at', { ascending: true }).limit(30);
    setList(data ?? []);
  }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!title.trim()) return setMsg('先写活动标题');
    const { error } = await supabase.from('events').insert({
      title: title.trim().slice(0, 60), description: desc.trim().slice(0, 500) || null,
      event_at: at ? new Date(at).toISOString() : null, location: loc.trim() || null, created_by: me,
    });
    if (error) setMsg('发布失败：' + error.message);
    else { await alog('event_add', { title: title.trim() }); setTitle(''); setDesc(''); setAt(''); setLoc(''); load(); setMsg('活动已发布'); }
  }
  async function del(id: number) {
    if (!(await confirmDialog('删除这个活动？报名数据一起删除。', { danger: true }))) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) { await alog('event_delete', { id }); load(); } else setMsg('删除失败：' + error.message);
  }
  return (
    <div style={card}>
      <h3 style={h3}>活动管理</h3>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="活动标题，如：毕业聚餐" maxLength={60} style={{ marginBottom: 8 }} />
      <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="活动介绍…" rows={2} maxLength={500} style={{ width: '100%', marginBottom: 8 }} />
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <DateTimeField value={at} onChange={setAt} style={{ flex: 1, margin: 0 }} />
        <input value={loc} onChange={e => setLoc(e.target.value)} placeholder="地点" style={{ flex: 1 }} />
      </div>
      <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={add}>发布活动</button>
      <div style={{ marginTop: 12 }}>
        {list.map(e => (
          <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{e.title}</div>
            <div style={mut}>{e.event_at ? new Date(e.event_at).toLocaleString() : '时间待定'}{e.location ? ` · ${e.location}` : ''}</div>
            <button className="mini danger" style={{ marginTop: 6 }} onClick={() => del(e.id)}>删除</button>
          </div>
        ))}
        {list.length === 0 && <p style={mut}>暂无活动</p>}
      </div>
    </div>
  );
}
