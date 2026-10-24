import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

/** 班级活动：查看 + 报名 */
export default function Events() {
  const me = useAuth().session!.user.id;
  const [list, setList] = useState<any[]>([]);
  const [regs, setRegs] = useState<Record<number, string[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.from('events').select('*').order('event_at', { ascending: true }).limit(30);
    setList(data ?? []);
    const { data: r } = await supabase.from('event_regs').select('event_id, profile_id');
    const mp: Record<number, string[]> = {};
    (r ?? []).forEach((x: any) => { (mp[x.event_id] = mp[x.event_id] || []).push(x.profile_id); });
    setRegs(mp);
    const ids = [...new Set((r ?? []).map((x: any) => x.profile_id))];
    if (ids.length) {
      const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 100, skip: 0 });
      const nm: Record<string, string> = {};
      ((dir ?? []) as any[]).forEach((x: any) => { if (ids.includes(x.id)) nm[x.id] = x.display_name || x.username || '暂未填写'; });
      setNames(nm);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggle(id: number, joined: boolean) {
    if (joined) {
      if (!confirm('取消报名？')) return;
      await supabase.from('event_regs').delete().eq('event_id', id).eq('profile_id', me);
    } else {
      const { error } = await supabase.from('event_regs').insert({ event_id: id, profile_id: me });
      if (error) return alert('报名失败：' + error.message);
    }
    load();
  }

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      <div className="hero"><h1>班级活动</h1><p>聚 会 · 出 游 · 纪 念 日</p></div>
      {list.map(e => {
        const joined = (regs[e.id] || []).includes(me);
        return (
          <div key={e.id} className="card">
            <div style={{ fontSize: 16, fontWeight: 700 }}>{e.title}</div>
            {e.description && <p style={{ fontSize: 13.5, color: 'var(--mut)', margin: '6px 0' }}>{e.description}</p>}
            <div style={{ fontSize: 12.5, color: 'var(--mut)' }}>
              {e.event_at ? new Date(e.event_at).toLocaleString() : '时间待定'}
              {e.location ? ` · ${e.location}` : ''}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--mut)', marginTop: 4 }}>
              已报名 {(regs[e.id] || []).length} 人：{(regs[e.id] || []).slice(0, 8).map(id => names[id] || '').filter(Boolean).join('、')}
              {(regs[e.id] || []).length > 8 ? '…' : ''}
            </div>
            <button className={joined ? 'mini ghost' : 'mini'} style={{ marginTop: 8 }} onClick={() => toggle(e.id, joined)}>
              {joined ? '取消报名' : '报名参加'}
            </button>
          </div>
        );
      })}
      {list.length === 0 && <div className="center"><div className="card">暂无活动，敬请期待</div></div>}
      <p style={{ textAlign: 'center', color: 'var(--mut)', fontSize: 12.5 }}>活动由管理员发布</p>
    </div>
  );
}
