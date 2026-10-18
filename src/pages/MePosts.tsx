import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

/** 我的动态 */
export default function MePosts() {
  const me = useAuth().session!.user.id;
  const [posts, setPosts] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await supabase.from('posts')
      .select('id, content, image_url, created_at').eq('author_id', me)
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
    setPosts(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function del(p: any) {
    if (!confirm('删除这条动态？评论和点赞会一起删除。')) return;
    const { error } = await supabase.from('posts').delete().eq('id', p.id);
    if (!error) load(); else setMsg('删除失败：' + error.message);
  }

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>我的动态（{posts.length}）</h2>
      {msg && <p className="priv-note">{msg}</p>}
      {posts.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>还没有发布过动态</div>}
      {posts.map(p => (
        <div key={p.id} className="card">
          <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{p.content}</div>
          {p.image_url && <img src={p.image_url} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 8 }} loading="lazy" />}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>{(p.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            <button className="mini danger" onClick={() => del(p)}>删除</button>
          </div>
        </div>
      ))}
    </div>
  );
}
