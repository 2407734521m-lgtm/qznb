import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';
import { confirmDialog, alertDialog } from '../lib/dialog';
import { useSignedUrls } from '../lib/media';

/** 我的动态 */
export default function MePosts() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [posts, setPosts] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const imageUrls = useSignedUrls('media', posts.map(post => post.image_url));

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('posts')
      .select('id, content, image_url, created_at, section').eq('author_id', me)
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
    if (error) setMsg('加载失败：' + error.message);
    else setPosts(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function del(p: any) {
    if (!(await confirmDialog('删除这条动态？评论和点赞会一起删除。', { danger: true }))) return;
    const { data, error } = await supabase.from('posts').delete()
      .eq('id', p.id).eq('author_id', me).select('id').maybeSingle();
    if (error) { alertDialog('删除失败：' + error.message); return; }
    if (!data) { alertDialog('内容未删除：记录不存在或当前账号没有权限。'); return; }
    let cleanupMessage = '';
    if (p.image_url && !p.image_url.startsWith('http://') && !p.image_url.startsWith('https://')) {
      if (!p.image_url.startsWith(`${me}/`)) cleanupMessage = '图片路径未确认属于当前账号，未自动清理。';
      else {
        const { error: storageError } = await supabase.storage.from('media').remove([p.image_url]);
        if (storageError) cleanupMessage = '动态已删除，但图片文件清理失败：' + storageError.message;
      }
    }
    await load();
    if (cleanupMessage) alertDialog(cleanupMessage);
    else setMsg('动态已删除。');
  }

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <BackButton fallback="/me" />
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>我的动态（{posts.length}）</h2>
      {msg && <p className="priv-note" role="status">{msg}</p>}
      {loading && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '22px 14px' }}>正在加载…</div>}
      {!loading && posts.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>还没有发布过动态</div>}
      {posts.map(p => (
        <div key={p.id} className="card">
          <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{p.content}</div>
          {p.image_url && imageUrls[p.image_url] && <img src={imageUrls[p.image_url]} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 8 }} loading="lazy" />}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--mut)' }}><span style={{ marginRight: 6, padding: '1px 6px', borderRadius: 999, background: '#eef2ff', color: '#4c5ec2' }}>{p.section === 'daily' ? '日常' : '动态'}</span>{(p.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            <div className="row" style={{ gap: 6 }}>
              <button className="mini ghost" onClick={() => nav(p.section === 'daily' ? '/daily' : '/feed', { state: { searchQuery: String(p.content || '').slice(0, 32) } })}>查看 / 编辑</button>
              <button className="mini danger" onClick={() => void del(p)}>删除</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
