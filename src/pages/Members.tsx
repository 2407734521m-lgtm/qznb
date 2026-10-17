import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Photo from '../components/Photo';

export type M = { id: string; username: string; display_name: string | null; personality: string | null;
  signature: string | null; avatar_path: string | null };
const PAGE = 12;

export default function Members() {
  const nav = useNavigate();
  const [q, setQ] = useState(''); const [rows, setRows] = useState<M[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading'); const [more, setMore] = useState(false);

  async function load(reset: boolean, query: string) {
    setState('loading');
    const { data, error } = await supabase.rpc('member_directory',
      { q: query, lim: PAGE, skip: reset ? 0 : rows.length });
    if (error) return setState('error');
    const list = (data ?? []) as M[];
    setRows(reset ? list : [...rows, ...list]); setMore(list.length === PAGE); setState('ok');
  }
  useEffect(() => { const t = setTimeout(() => load(true, q), 300); return () => clearTimeout(t); }, [q]);

  return (
    <>
      <input placeholder="按姓名、性格搜索" value={q} onChange={e => setQ(e.target.value)} />
      {state === 'error' && <p className="err">加载失败。请确认已用邀请码加入班级，或检查网络后重试。
        <button onClick={() => load(true, q)}>重试</button></p>}
      {state === 'ok' && rows.length === 0 && <div className="center"><div className="card">
        {q ? '没有找到匹配的成员。' : '还没有成员公开资料。先到「我的档案」填写资料并加入班级，邀请同学注册吧。'}</div></div>}
      <div className="grid">
        {rows.map(m => (
          <div key={m.id} className="card mcard" onClick={() => nav(`/members/${m.id}`, { state: { m } })}>
            <Photo id={m.id} path={m.avatar_path} name={m.display_name ?? m.username} />
            <h3>{m.display_name ?? m.username}</h3>
            <p>{m.signature ?? m.personality ?? ''}</p>
          </div>
        ))}
      </div>
      {state === 'loading' && <p className="center">加载中…</p>}
      {state === 'ok' && more && <button className="pri" onClick={() => load(false, q)}>加载更多</button>}
    </>
  );
}
