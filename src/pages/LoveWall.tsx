import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

// 公开列表来自 love_wall_published()，不含 author_id；自己的投稿来自表查询，只含自己的 author_id。
type PublicPost = { id: string; recipient_name: string | null; category: string; content: string; is_anonymous: boolean; author_display_name: string | null; status: string; created_at: string };
type MyPost = { id: string; author_id: string; recipient_name: string | null; category: string; content: string; is_anonymous: boolean; status: string; created_at: string };

const categories = ['暗恋心事', '认真表白', '感谢与祝福', '毕业寄语'];
const catColor: Record<string, { bg: string; fg: string }> = {
  '暗恋心事': { bg: '#fdeef3', fg: '#c2437b' },
  '认真表白': { bg: '#fdecec', fg: '#c22f3d' },
  '感谢与祝福': { bg: '#fdf6e0', fg: '#9a7408' },
  '毕业寄语': { bg: '#eceffd', fg: '#4c5ec2' },
};

function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(s).toLocaleDateString();
}

export default function LoveWall() {
  const { session } = useAuth();
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [content, setContent] = useState('');
  const [recipient, setRecipient] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [formErr, setFormErr] = useState('');
  const [mine, setMine] = useState(false);
  const [composing, setComposing] = useState(false);
  const [anon, setAnon] = useState(true);

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

  async function openCompose() {
    setFormErr('');
    // 匿名开关的默认值取个人隐私设置（表白墙隐藏姓名）：读取失败或设置缺失时默认匿名。
    if (session) {
      const { data: privRow } = await supabase.from('profile_privacy').select('hide_love_wall_name').eq('profile_id', session.user.id).single();
      setAnon(privRow?.hide_love_wall_name !== false);
    }
    setComposing(true);
  }

  async function publish() {
    if (!session) return;
    const text = content.trim();
    if (text.length < 2 || text.length > 500) { setFormErr('内容请填写 2–500 个字。'); return; }
    setBusy(true); setFormErr('');
    // 匿名与否由发布表单里的开关决定（打开表单时按个人隐私设置初始化默认值）；历史帖子不受影响。
    const { error } = await supabase.from('love_wall_posts').insert({
      author_id: session.user.id, recipient_name: recipient.trim() || null,
      category, content: text, is_anonymous: anon, status: 'pending'
    });
    setBusy(false);
    if (error) { setFormErr('发布失败：请确认网站数据库迁移已执行。'); return; }
    setContent(''); setRecipient('');
    setComposing(false);
    setMine(true);
    setNotice('投稿已提交，审核通过后会展示在表白墙。');
    await load();
  }

  const shown = mine ? myPosts : posts;
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '12px 0 110px', color: '#202124' }}>
    {/* 头部：只留标题与页签，发布收成一个按钮 */}
    <div style={{ padding: '6px 2px 0' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: '#737b89' }}>OUR CLASS · LITTLE FEELINGS</div>
      <h1 style={{ fontSize: 27, margin: '8px 0 4px' }}>表白墙</h1>
      <p style={{ color: '#606673', lineHeight: 1.7, fontSize: 13, margin: 0 }}>把喜欢、感谢和没来得及说的话，留在青春档案里。</p>
    </div>

    <div style={{ display: 'flex', gap: 8, margin: '16px 2px 14px' }}>
      <button onClick={() => setMine(false)} style={mine ? ghost : segOn}>全部心意</button>
      <button onClick={() => setMine(true)} style={mine ? segOn : ghost}>我的投稿</button>
    </div>

    {notice && <p role="status" style={{ background: '#f2f5fb', border: '1px solid #dfe6f2', borderRadius: 12, padding: '10px 12px', color: '#333946', fontSize: 12.5, lineHeight: 1.6, margin: '0 2px 12px' }}>{notice}</p>}

    {/* 信息流：和班级动态一样的时间流卡片 */}
    {shown.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#606673', border: '1px dashed #dfe3ea', borderRadius: 18 }}>{mine ? '你还没有投稿，点右下角按钮写下第一份心意吧。' : '这里还没有内容，点右下角按钮写下第一份温柔的心意吧。'}</div>}
    <div style={{ display: 'grid', gap: 12 }}>
      {shown.map(p => {
        const cc = catColor[p.category] || { bg: '#eef1f6', fg: '#5a6472' };
        const statusText = p.status === 'pending' ? '审核中' : p.status === 'rejected' ? '未通过' : p.status === 'hidden' ? '已隐藏' : timeAgo(p.created_at);
        return <article key={p.id} style={{ padding: 17, borderRadius: 18, border: '1px solid #e9ebf0', background: '#fff', boxShadow: '0 8px 28px #202a3d0a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, background: cc.bg, color: cc.fg, borderRadius: 999, padding: '4px 10px' }}>{p.category}</span>
            <span style={{ fontSize: 11, color: '#8a93a1' }}>{statusText}</span>
          </div>
          {p.recipient_name && <div style={{ marginTop: 10, fontSize: 12.5, color: '#333946' }}>TO · <b>{p.recipient_name}</b></div>}
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: '10px 0 12px', overflowWrap: 'anywhere', fontSize: 14.5 }}>{p.content}</p>
          <div style={{ fontSize: 11, color: '#606673' }}>{p.is_anonymous ? '匿名同学' : (mine ? '我发布的' : ((p as PublicPost).author_display_name || '班级同学'))} · {p.status === 'pending' ? '仅你和管理员可见' : p.status === 'published' ? '已公开展示' : '未公开展示'}</div>
        </article>;
      })}
    </div>

    {/* 唯一的发布入口：悬浮按钮（避开底部 Dock） */}
    <button onClick={() => { void openCompose(); }} aria-label="写表白"
      style={{ position: 'fixed', right: 18, bottom: 'calc(92px + env(safe-area-inset-bottom))', zIndex: 60, border: 0, borderRadius: 999, padding: '13px 20px', background: 'linear-gradient(135deg,#e0567a,#c22f3d)', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 12px 28px rgba(194,47,61,.35)', cursor: 'pointer' }}>
      ✎ 写表白
    </button>

    {/* 发布面板：底部弹层，字段与原来的投稿表单一致 */}
    {composing && (
      <div role="dialog" aria-modal="true" aria-label="写表白"
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(16,20,28,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        onClick={() => !busy && setComposing(false)}>
        <section onClick={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 620, maxHeight: '88dvh', overflowY: 'auto', background: '#fff', borderRadius: '22px 22px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <b style={{ fontSize: 16 }}>写表白</b>
            <button onClick={() => !busy && setComposing(false)} aria-label="关闭" style={{ border: 0, background: '#f2f4f7', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 14, color: '#333946' }}>✕</button>
          </div>
          <label style={{ display: 'block', fontSize: 12, color: '#606673', margin: '14px 0 6px' }}>投稿类型</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={field}>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
          <label style={{ display: 'block', fontSize: 12, color: '#606673', margin: '12px 0 6px' }}>写给谁（选填）</label>
          <input value={recipient} onChange={e => setRecipient(e.target.value)} maxLength={40} placeholder="可以留空" style={field} />
          <label style={{ display: 'block', fontSize: 12, color: '#606673', margin: '12px 0 6px' }}>写下你的心意</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={500} rows={4} placeholder="请尊重他人，不要发布联系方式、隐私或让对方不舒服的内容。" style={{ ...field, resize: 'vertical' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '14px 0 4px' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#202632' }}>匿名发布</div>
              <div style={{ fontSize: 12, color: '#606673', marginTop: 2, lineHeight: 1.5 }}>{anon ? '开启：墙上显示为「匿名同学」，不显示你的名字' : '关闭：墙上会显示你的名字'}</div>
            </div>
            <button type="button" role="switch" aria-checked={anon} aria-label="匿名发布" onClick={() => setAnon(v => !v)}
              style={{ flex: '0 0 auto', width: 46, height: 26, borderRadius: 999, border: 0, padding: 2, cursor: 'pointer', background: anon ? '#202632' : '#d8dde6', transition: 'background .15s' }}>
              <span style={{ display: 'block', width: 22, height: 22, borderRadius: '50%', background: '#fff', transform: anon ? 'translateX(20px)' : 'translateX(0)', transition: 'transform .15s' }} />
            </button>
          </div>
          <div style={{ margin: '6px 0 12px', fontSize: 12, color: '#606673', lineHeight: 1.6 }}>开关默认按个人中心的隐私设置（表白墙隐藏姓名），每次发帖都能单独改；只影响新帖子，管理员仍可查看投稿账号。</div>
          {formErr && <p role="status" style={{ color: '#b3261e', fontSize: 12, lineHeight: 1.6 }}>{formErr}</p>}
          <button onClick={publish} disabled={busy} style={{ ...primary, width: '100%' }}>{busy ? '提交中…' : '提交审核'}</button>
        </section>
      </div>
    )}
  </main>;
}

const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #dfe3ea', background: '#fff', color: '#202124', padding: '11px 12px', borderRadius: 12, outline: 'none', font: 'inherit', fontSize: 13 };
const primary: React.CSSProperties = { border: 0, borderRadius: 999, padding: '11px 18px', background: '#202632', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const ghost: React.CSSProperties = { border: '1px solid #dfe3ea', borderRadius: 999, padding: '7px 14px', background: '#fff', color: '#333946', cursor: 'pointer', fontSize: 12.5 };
const segOn: React.CSSProperties = { border: '1px solid #202632', borderRadius: 999, padding: '7px 14px', background: '#202632', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 };
