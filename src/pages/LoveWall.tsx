import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

// 公开列表来自 love_wall_published()，不含 author_id；自己的投稿来自表查询，只含自己的 author_id。
type PublicPost = { id: string; recipient_name: string | null; category: string; content: string; is_anonymous: boolean; author_display_name: string | null; status: string; created_at: string };
type MyPost = { id: string; author_id: string; recipient_name: string | null; category: string; content: string; is_anonymous: boolean; status: string; created_at: string };

const categories = ['暗恋心事', '认真表白', '感谢与祝福', '毕业寄语'];

export default function LoveWall() {
  const { session } = useAuth();
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [content, setContent] = useState('');
  const [recipient, setRecipient] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [mine, setMine] = useState(false);

  async function load() {
    const { data, error } = await supabase.rpc('love_wall_published');
    if (error) { setNotice('暂时无法加载表白墙，请稍后再试。'); return; }
    setPosts((data || []) as PublicPost[]);
    if (session) {
      const { data: mineData } = await supabase.from('love_wall_posts')
        .select('id,author_id,recipient_name,category,content,is_anonymous,status,created_at')
        .eq('author_id', session.user.id)
        .order('created_at', { ascending: false }).limit(100);
      setMyPosts((mineData || []) as MyPost[]);
    } else {
      setMyPosts([]);
    }
  }
  useEffect(() => { void load(); }, []);

  async function publish() {
    if (!session) return;
    const text = content.trim();
    if (text.length < 2 || text.length > 500) { setNotice('内容请填写 2–500 个字。'); return; }
    setBusy(true); setNotice('');
    // 个人设置控制：读取失败或设置缺失时默认匿名；历史帖子不受此影响。
    const { data: privRow } = await supabase.from('profile_privacy').select('hide_love_wall_name').eq('profile_id', session.user.id).single();
    const isAnon = privRow?.hide_love_wall_name !== false;
    const { error } = await supabase.from('love_wall_posts').insert({
      author_id: session.user.id, recipient_name: recipient.trim() || null,
      category, content: text, is_anonymous: isAnon, status: 'pending'
    });
    setBusy(false);
    if (error) { setNotice('发布失败：请确认网站数据库迁移已执行。'); return; }
    setContent(''); setRecipient('');
    setNotice('投稿已提交，审核通过后会展示在表白墙。');
    await load();
  }

  const shown = mine ? myPosts : posts;
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '12px 0 28px', color: '#f5f6ff' }}>
    <section style={{ padding: 22, borderRadius: 24, border: '1px solid #ffffff20', background: 'linear-gradient(145deg,#241b39dd,#11182ddd)', boxShadow: '0 18px 60px #0005' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: '#d7a9ff' }}>OUR CLASS · LITTLE FEELINGS</div>
      <h1 style={{ fontSize: 27, margin: '10px 0 6px' }}>心动信箱</h1>
      <p style={{ color: '#b8bdd3', lineHeight: 1.7, fontSize: 13, marginTop: 0 }}>把喜欢、感谢和没来得及说的话，留在青春档案里。</p>
      <label style={{ display: 'block', fontSize: 12, color: '#c5c9df', margin: '14px 0 6px' }}>投稿类型</label>
      <select value={category} onChange={e => setCategory(e.target.value)} style={field}>
        {categories.map(c => <option key={c}>{c}</option>)}
      </select>
      <label style={{ display: 'block', fontSize: 12, color: '#c5c9df', margin: '12px 0 6px' }}>写给谁（选填）</label>
      <input value={recipient} onChange={e => setRecipient(e.target.value)} maxLength={40} placeholder="可以留空" style={field} />
      <label style={{ display: 'block', fontSize: 12, color: '#c5c9df', margin: '12px 0 6px' }}>写下你的心意</label>
      <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={500} rows={4} placeholder="请尊重他人，不要发布联系方式、隐私或让对方不舒服的内容。" style={{ ...field, resize: 'vertical' }} />
      <div style={{ margin: '12px 0', fontSize: 12, color: '#939ab6', lineHeight: 1.6 }}>是否隐藏姓名由个人设置控制（个人中心 → 隐私设置 → 表白墙隐藏姓名），只影响新帖子，老帖子保持原样；管理员仍可查看投稿账号。</div>
      <button onClick={publish} disabled={busy} style={primary}>{busy ? '提交中…' : '提交审核'}</button>
      {notice && <p role="status" style={{ color: '#d7d9f0', fontSize: 12, lineHeight: 1.6 }}>{notice}</p>}
    </section>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 2px 12px' }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>墙上的心意</h2>
      <button onClick={() => setMine(v => !v)} style={ghost}>{mine ? '查看全部公开' : '我的投稿'}</button>
    </div>
    {shown.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#9ca3bd', border: '1px dashed #ffffff25', borderRadius: 18 }}>这里还没有内容，写下第一份温柔的心意吧。</div>}
    <div style={{ display: 'grid', gap: 12 }}>
      {shown.map(p => <article key={p.id} style={{ padding: 17, borderRadius: 18, border: '1px solid #ffffff18', background: '#11182bd9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, color: '#c3a5ff' }}><span>{p.category}</span><span>{p.status === 'pending' ? '审核中' : p.status === 'rejected' ? '未通过' : p.status === 'hidden' ? '已隐藏' : new Date(p.created_at).toLocaleDateString()}</span></div>
        {p.recipient_name && <div style={{ marginTop: 10, fontSize: 12, color: '#c7c9dc' }}>TO · {p.recipient_name}</div>}
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: '10px 0 12px', overflowWrap: 'anywhere' }}>{p.content}</p>
        <div style={{ fontSize: 11, color: '#9299b4' }}>{p.is_anonymous ? '匿名同学' : (mine ? '我发布的' : ((p as PublicPost).author_display_name || '班级同学'))} · {p.status === 'pending' ? '仅你和管理员可见' : p.status === 'published' ? '已公开展示' : '未公开展示'}</div>
      </article>)}
    </div>
  </main>;
}

const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #ffffff20', background: '#090e1ddd', color: '#f5f6ff', padding: '11px 12px', borderRadius: 12, outline: 'none', font: 'inherit', fontSize: 13 };
const primary: React.CSSProperties = { border: 0, borderRadius: 999, padding: '11px 18px', background: 'linear-gradient(135deg,#d18bff,#738bff)', color: '#101225', fontWeight: 800, cursor: 'pointer' };
const ghost: React.CSSProperties = { border: '1px solid #ffffff20', borderRadius: 999, padding: '7px 12px', background: '#ffffff0a', color: '#e4e7fa', cursor: 'pointer', fontSize: 12 };
