import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Post = {
  id: string; author_id: string; recipient_name: string | null; category: string;
  content: string; is_anonymous: boolean; status: string; created_at: string;
};
type Profile = { id: string; username: string | null; display_name: string | null; real_name: string | null };

const statusLabel: Record<string, string> = {
  pending: '待审核', published: '已发布', hidden: '已隐藏', rejected: '未通过',
};
const statusColor: Record<string, string> = {
  pending: '#f5b942', published: '#57d6a0', hidden: '#a8b1ca', rejected: '#ff8b91',
};
const panel: React.CSSProperties = {
  background: 'linear-gradient(145deg,#171e33,#0d1222)', border: '1px solid #ffffff18',
  borderRadius: 16, padding: 15, marginBottom: 12,
};
const field: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#080d1b',
  border: '1px solid #ffffff20', borderRadius: 11, padding: '10px 11px',
  color: '#f4f6ff', fontSize: 13, outline: 'none',
};
const action: React.CSSProperties = {
  border: '1px solid #ffffff20', borderRadius: 999, padding: '8px 11px',
  background: '#ffffff0d', color: '#eef0ff', fontSize: 12, cursor: 'pointer',
};

export default function AdminLoveWall({ setMsg }: { setMsg: (s: string) => void }) {
  const [rows, setRows] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState('pending');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('love_wall_posts')
      .select('id,author_id,recipient_name,category,content,is_anonymous,status,created_at')
      .order('created_at', { ascending: false }).limit(500);
    if (error) {
      setMsg('表白墙管理暂不可用：请检查 007_love_wall.sql 迁移和管理员数据库权限。');
      setLoading(false);
      return;
    }
    const nextRows = (data || []) as Post[];
    setRows(nextRows);
    const ids = [...new Set(nextRows.map(p => p.author_id))];
    if (ids.length) {
      const { data: people, error: peopleError } = await supabase.from('profiles')
        .select('id,username,display_name,real_name').in('id', ids);
      if (peopleError) setMsg('投稿已加载，但部分投稿者资料读取失败；请检查管理员读取权限。');
      setProfiles(Object.fromEntries(((people || []) as Profile[]).map(p => [p.id, p])));
    } else setProfiles({});
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function setStatus(p: Post, status: string) {
    if (busy) return;
    setBusy(p.id); setMsg('');
    const { error } = await supabase.from('love_wall_posts')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', p.id);
    setBusy(null);
    if (error) { setMsg('处理失败，请检查管理员权限和数据库策略。'); return; }
    setMsg('已将投稿状态更新为「' + (statusLabel[status] || status) + '」。');
    await load();
  }

  const counts = useMemo(() => ({
    pending: rows.filter(p => p.status === 'pending').length,
    published: rows.filter(p => p.status === 'published').length,
    hidden: rows.filter(p => p.status === 'hidden').length,
    rejected: rows.filter(p => p.status === 'rejected').length,
  }), [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return rows.filter(p => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      const profile = profiles[p.author_id];
      const haystack = [
        p.content, p.recipient_name, p.author_id, profile?.display_name,
        profile?.real_name, profile?.username, p.category,
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      return haystack.includes(q);
    });
  }, [rows, profiles, filter, category, query]);

  const categories = useMemo(() => [...new Set(rows.map(p => p.category).filter(Boolean))], [rows]);

  return <section>
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>表白墙管理</h2>
          <p style={{ margin: 0, color: '#9da6c3', fontSize: 12, lineHeight: 1.6 }}>
            匿名只对普通用户隐藏。管理员可核查投稿账号；仅在处理举报或安全问题时查看身份，并保护同学隐私。
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} style={action}>{loading ? '刷新中…' : '刷新'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 14 }}>
        {[
          ['待审核', counts.pending, '#f5b942'],
          ['已发布', counts.published, '#57d6a0'],
          ['已隐藏', counts.hidden, '#a8b1ca'],
          ['未通过', counts.rejected, '#ff8b91'],
        ].map(([label, value, color]) => <div key={String(label)} style={{
          background: '#ffffff08', border: '1px solid #ffffff10', borderRadius: 12, padding: 11,
        }}>
          <div style={{ color: '#9da6c3', fontSize: 11 }}>{label}</div>
          <div style={{ fontSize: 23, fontWeight: 800, color: String(color), marginTop: 3 }}>{value}</div>
        </div>)}
      </div>
      <label style={{ display: 'block', fontSize: 12, color: '#b8bfd7', margin: '14px 0 6px' }}>搜索投稿、收件人或投稿者</label>
      <input value={query} onChange={e => setQuery(e.target.value)}
        placeholder="输入内容、姓名、用户名或账号 ID" style={field} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginTop: 8 }}>
        <select aria-label="投稿状态筛选" value={filter} onChange={e => setFilter(e.target.value)} style={field}>
          <option value="pending">待审核</option><option value="published">已发布</option>
          <option value="hidden">已隐藏</option><option value="rejected">未通过</option><option value="all">全部状态</option>
        </select>
        <select aria-label="投稿类型筛选" value={category} onChange={e => setCategory(e.target.value)} style={field}>
          <option value="all">全部类型</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11, color: '#8f99b8', marginTop: 9 }}>
        当前显示 {shown.length} 条 · 本次加载 {rows.length} 条（最多 500 条）
      </div>
    </div>

    {loading && rows.length === 0 && <p style={{ color: '#9da6c3', textAlign: 'center', padding: 24 }}>正在加载投稿…</p>}
    {!loading && shown.length === 0 && <p style={{ ...panel, color: '#9da6c3', textAlign: 'center' }}>没有符合筛选条件的投稿。</p>}

    <div style={{ display: 'grid', gap: 10 }}>
      {shown.map(p => {
        const profile = profiles[p.author_id];
        const sender = profile?.display_name || profile?.real_name || profile?.username || '未找到对应资料';
        return <article key={p.id} style={{
          border: '1px solid #ffffff18', borderRadius: 15, background: '#11182b', padding: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#c9b6ff' }}>{p.category || '未分类'}</span>
              <span style={{ fontSize: 10, borderRadius: 999, padding: '3px 7px', color: statusColor[p.status] || '#d6dcf5', background: (statusColor[p.status] || '#d6dcf5') + '18' }}>
                {statusLabel[p.status] || p.status}
              </span>
            </div>
            <span style={{ fontSize: 10, color: '#8f99b8', textAlign: 'right', flexShrink: 0 }}>
              {new Date(p.created_at).toLocaleString()}
            </span>
          </div>
          {p.recipient_name && <div style={{ marginTop: 10, fontSize: 12, color: '#c7c9dc' }}>收件人：{p.recipient_name}</div>}
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, overflowWrap: 'anywhere', margin: '10px 0 12px' }}>{p.content}</p>
          <div style={{ borderTop: '1px solid #ffffff10', paddingTop: 10, fontSize: 11, color: '#b8bfd7', lineHeight: 1.8 }}>
            <div>投稿者：<strong style={{ color: '#f0f2ff' }}>{sender}</strong> · {p.is_anonymous ? '对用户匿名' : '公开署名'}</div>
            <div style={{ overflowWrap: 'anywhere' }}>账号 ID：{p.author_id}</div>
            <div>投稿编号：{p.id}</div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
            {p.status !== 'published' && <button disabled={busy === p.id || busy !== null} onClick={() => void setStatus(p, 'published')} style={action}>审核通过并公开</button>}
            {p.status !== 'hidden' && <button disabled={busy === p.id || busy !== null} onClick={() => void setStatus(p, 'hidden')} style={action}>隐藏</button>}
            {p.status !== 'rejected' && <button disabled={busy === p.id || busy !== null} onClick={() => void setStatus(p, 'rejected')} style={action}>拒绝</button>}
            {p.status !== 'pending' && <button disabled={busy === p.id || busy !== null} onClick={() => void setStatus(p, 'pending')} style={action}>退回待审核</button>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
