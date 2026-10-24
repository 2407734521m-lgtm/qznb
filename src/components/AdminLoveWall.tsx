import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Post = { id: string; author_id: string; recipient_name: string | null; category: string; content: string; is_anonymous: boolean; status: string; created_at: string };
type Profile = { id: string; username: string | null; display_name: string | null; real_name: string | null };

export default function AdminLoveWall({ setMsg }: { setMsg: (s: string) => void }) {
  const [rows, setRows] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState<string | null>(null);
  async function load() {
    const { data, error } = await supabase.from('love_wall_posts').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { setMsg('表白墙管理暂不可用：请先执行 007_love_wall.sql 数据库迁移。'); return; }
    const nextRows = (data || []) as Post[];
    setRows(nextRows);
    const ids = [...new Set(nextRows.map(p => p.author_id))];
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id,username,display_name,real_name').in('id', ids);
      setProfiles(Object.fromEntries(((people || []) as Profile[]).map(p => [p.id, p])));
    } else setProfiles({});
  }
  useEffect(() => { void load(); }, []);
  async function setStatus(p: Post, status: string) {
    setBusy(p.id); setMsg('');
    const { error } = await supabase.from('love_wall_posts').update({ status, updated_at: new Date().toISOString() }).eq('id', p.id);
    setBusy(null);
    if (error) { setMsg('处理失败，请检查管理员权限和数据库策略。'); return; }
    setMsg('已更新投稿状态。');
    await load();
  }
  const shown = filter === 'all' ? rows : rows.filter(p => p.status === filter);
  return <section>
    <div style={{ background: 'linear-gradient(145deg,#171e33,#0d1222)', border: '1px solid #ffffff18', borderRadius: 16, padding: 15, marginBottom: 12 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>表白墙审核</h2>
      <p style={{ color: '#9da6c3', fontSize: 12, lineHeight: 1.6 }}>管理员可查看匿名投稿对应的账号 ID。普通用户只能看到匿名展示名；处理内容时请保护学生隐私。</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[['pending','待审核'],['published','已发布'],['hidden','已隐藏'],['rejected','未通过'],['all','全部']].map(([v,l]) => <button key={v} onClick={() => setFilter(v)} style={{ border: 0, borderRadius: 999, padding: '8px 12px', background: filter===v?'#687cff':'#ffffff12', color: '#fff' }}>{l} {v==='all'?rows.length:rows.filter(p=>p.status===v).length}</button>)}</div>
    </div>
    {shown.length===0 && <p style={{ color: '#9da6c3', textAlign: 'center', padding: 24 }}>这个分类暂时没有投稿。</p>}
    <div style={{ display: 'grid', gap: 10 }}>{shown.map(p => <article key={p.id} style={{ border: '1px solid #ffffff18', borderRadius: 15, background: '#11182b', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#b9a4ff' }}><span>{p.category} · {p.status}</span><span>{new Date(p.created_at).toLocaleString()}</span></div>
      <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, overflowWrap: 'anywhere' }}>{p.content}</p>
      <div style={{ fontSize: 11, color: '#b8bfd7', lineHeight: 1.7 }}>投稿者：{profiles[p.author_id]?.display_name || profiles[p.author_id]?.real_name || profiles[p.author_id]?.username || '未找到对应资料'}<br/>账号 ID：{p.author_id}<br/>展示方式：{p.is_anonymous?'匿名':'署名'} · 收件人：{p.recipient_name || '未填写'}</div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
        {p.status!=='published' && <button disabled={busy===p.id} onClick={() => void setStatus(p,'published')} style={action}>审核通过并公开</button>}
        {p.status!=='hidden' && <button disabled={busy===p.id} onClick={() => void setStatus(p,'hidden')} style={action}>隐藏</button>}
        {p.status!=='rejected' && <button disabled={busy===p.id} onClick={() => void setStatus(p,'rejected')} style={action}>拒绝</button>}
        {p.status!=='pending' && <button disabled={busy===p.id} onClick={() => void setStatus(p,'pending')} style={action}>退回待审核</button>}
      </div>
    </article>)}</div>
  </section>;
}
const action: React.CSSProperties = { border: '1px solid #ffffff20', borderRadius: 999, padding: '8px 11px', background: '#ffffff0d', color: '#eef0ff', fontSize: 12, cursor: 'pointer' };
