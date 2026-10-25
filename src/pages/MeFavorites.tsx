import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';

/** 我的收藏：收藏的同学档案 + 动态 */
export default function MeFavorites() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [tab, setTab] = useState<'member' | 'post'>('member');
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  async function load(t: 'member' | 'post') {
    const { data } = await supabase.from('favorites')
      .select('target_id, created_at').eq('profile_id', me).eq('target_type', t)
      .order('created_at', { ascending: false });
    const rows = data ?? [];
    if (!rows.length) { setItems([]); return; }
    if (t === 'member') {
      const { data: ps } = await supabase.from('profiles').select('id, display_name, username').in('id', rows.map(r => r.target_id));
      const m: Record<string, any> = {};
      (ps ?? []).forEach((p: any) => { m[p.id] = p; });
      setItems(rows.map(r => ({ ...r, info: m[r.target_id] })).filter(r => r.info));
    } else {
      const { data: ps } = await supabase.from('posts').select('id, content, author_id, created_at').in('id', rows.map(r => Number(r.target_id)));
      const m: Record<string, any> = {};
      (ps ?? []).forEach((p: any) => { m[String(p.id)] = p; });
      setItems(rows.map(r => ({ ...r, info: m[r.target_id] })).filter(r => r.info));
    }
  }
  useEffect(() => { load(tab); }, [tab]);

  async function unFav(targetId: string) {
    const { error } = await supabase.from('favorites').delete()
      .eq('profile_id', me).eq('target_type', tab).eq('target_id', targetId);
    if (!error) load(tab); else setMsg('取消失败：' + error.message);
  }

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <BackButton fallback="/me" />
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>我的收藏</h2>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {([['member', '同学档案'], ['post', '动态']] as const).map(([k, l]) => (
          <button key={k} className={'mini' + (tab === k ? '' : ' ghost')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {msg && <p className="priv-note">{msg}</p>}
      {items.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>还没有收藏</div>}
      {items.map(r => (
        <div key={r.target_id} className="card">
          {tab === 'member' ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                onClick={() => nav(`/members/${r.target_id}`)}>
                {r.info.display_name || r.info.username}
              </span>
              <button className="mini ghost" onClick={() => unFav(r.target_id)}>取消收藏</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{(r.info.content || '').slice(0, 120)}</div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>{(r.info.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                <button className="mini ghost" onClick={() => unFav(r.target_id)}>取消收藏</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
