import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Post = {
  id: string;
  author_id: string;
  recipient_name: string | null;
  category: string;
  content: string;
  is_anonymous: boolean;
  status: string;
  created_at: string;
};
type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  real_name: string | null;
};

const FILTERS = [
  ['pending', '待审核'],
  ['published', '已发布'],
  ['hidden', '已隐藏'],
  ['rejected', '未通过'],
  ['all', '全部'],
] as const;

const statusLabel: Record<string, string> = {
  pending: '待审核',
  published: '已发布',
  hidden: '已隐藏',
  rejected: '未通过',
};

export default function AdminLoveWall({ setMsg }: { setMsg: (s: string) => void }) {
  const [rows, setRows] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data, error } = await supabase
      .from('love_wall_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      setMsg('表白墙管理暂不可用：请检查 007_love_wall.sql 是否已执行，以及管理员数据库权限。');
      if (!quiet) setLoading(false);
      return;
    }
    const nextRows = (data || []) as Post[];
    setRows(nextRows);
    const ids = [...new Set(nextRows.map(p => p.author_id).filter(Boolean))];
    if (ids.length) {
      const { data: people, error: peopleError } = await supabase
        .from('profiles')
        .select('id,username,display_name,real_name')
        .in('id', ids);
      if (!peopleError) {
        setProfiles(Object.fromEntries(((people || []) as Profile[]).map(p => [p.id, p])));
      }
    } else {
      setProfiles({});
    }
    if (!quiet) setLoading(false);
  }, [setMsg]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    pending: rows.filter(p => p.status === 'pending').length,
    published: rows.filter(p => p.status === 'published').length,
    hidden: rows.filter(p => p.status === 'hidden').length,
    rejected: rows.filter(p => p.status === 'rejected').length,
    all: rows.length,
  }), [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return rows.filter(p => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (!q) return true;
      const profile = profiles[p.author_id];
      const haystack = [
        p.content, p.recipient_name, p.category, p.author_id,
        profile?.display_name, profile?.real_name, profile?.username,
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      return haystack.includes(q);
    });
  }, [rows, profiles, filter, query]);

  async function setStatus(p: Post, status: string) {
    if (busy) return;
    setBusy(p.id);
    setMsg('');
    const { error } = await supabase
      .from('love_wall_posts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    setBusy(null);
    if (error) {
      setMsg('处理失败：请检查管理员权限、数据库策略后重试。');
      return;
    }
    setMsg(`已将表白投稿设为「${statusLabel[status] || status}」。`);
    await load(true);
  }

  const authorLabel = (p: Post) => {
    const profile = profiles[p.author_id];
    return profile?.display_name || profile?.real_name || profile?.username || '未找到对应资料';
  };

  return <section>
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>表白墙管理</h2>
          <p style={{ color: '#aab5d1', fontSize: 12, lineHeight: 1.65, margin: 0 }}>
            匿名只对普通用户隐藏身份。管理员可按授权查看投稿账号，用于审核和处理举报；请勿向无关人员泄露身份信息。
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading || !!busy} style={action}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 14 }}>
        {[
          ['待审核', counts.pending, '#f5c26b'],
          ['已发布', counts.published, '#7ed9b0'],
          ['已隐藏', counts.hidden, '#9bb8ff'],
          ['未通过', counts.rejected, '#ff9ba9'],
        ].map(([label, value, color]) => <div key={String(label)} style={statCard}>
          <div style={{ color: '#aab5d1', fontSize: 11 }}>{label}</div>
          <div style={{ color: String(color), fontSize: 22, fontWeight: 800, marginTop: 3 }}>{value}</div>
        </div>)}
      </div>
    </div>

    <div style={{ ...panel, padding: 12 }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="搜索内容、收件人、用户名或账号 ID"
        aria-label="搜索表白投稿"
        style={searchInput}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {FILTERS.map(([value, label]) => <button key={value} onClick={() => setFilter(value)}
          aria-pressed={filter === value}
          style={{ ...filterButton, background: filter === value ? '#687cff' : '#ffffff0d', borderColor: filter === value ? '#8795ff' : '#ffffff18' }}>
          {label} <span style={{ opacity: .8 }}>{counts[value]}</span>
        </button>)}
      </div>
      <div style={{ color: '#8491b1', fontSize: 11, marginTop: 10 }}>
        当前显示 {shown.length} 条 · 最多读取最近 500 条
      </div>
    </div>

    {loading && rows.length === 0 && <p style={{ color: '#aab5d1', textAlign: 'center', padding: 24 }}>正在加载表白投稿…</p>}
    {!loading && shown.length === 0 && <p style={{ color: '#9da6c3', textAlign: 'center', padding: 24 }}>没有符合条件的投稿。</p>}

    <div style={{ display: 'grid', gap: 10 }}>
      {shown.map(p => <article key={p.id} style={postCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={tag}>{p.category || '未分类'}</span>
            <span style={{ ...tag, color: p.status === 'published' ? '#8de0b7' : p.status === 'pending' ? '#f5d18a' : '#bac7e7' }}>
              {statusLabel[p.status] || p.status || '未知状态'}
            </span>
            <span style={{ ...tag, color: p.is_anonymous ? '#c5b4ff' : '#b8d7ff' }}>{p.is_anonymous ? '匿名投稿' : '署名投稿'}</span>
          </div>
          <time style={{ color: '#8491b1', fontSize: 11 }}>{new Date(p.created_at).toLocaleString()}</time>
        </div>

        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, overflowWrap: 'anywhere', margin: '13px 0' }}>{p.content}</p>

        <details style={identityBox}>
          <summary style={{ cursor: 'pointer', color: '#c5d3f5', fontSize: 12, fontWeight: 700, padding: '2px 0' }}>
            查看投稿者身份与记录
          </summary>
          <div style={{ marginTop: 10, fontSize: 12, color: '#b8bfd7', lineHeight: 1.9, overflowWrap: 'anywhere' }}>
            <div><strong style={{ color: '#edf2ff' }}>投稿者：</strong>{authorLabel(p)}</div>
            <div><strong style={{ color: '#edf2ff' }}>用户名：</strong>{profiles[p.author_id]?.username || '未设置'}</div>
            <div><strong style={{ color: '#edf2ff' }}>账号 ID：</strong>{p.author_id || '未知'}</div>
            <div><strong style={{ color: '#edf2ff' }}>接收对象：</strong>{p.recipient_name || '未填写'}</div>
            <div><strong style={{ color: '#edf2ff' }}>投稿编号：</strong>{p.id}</div>
          </div>
        </details>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
          {p.status !== 'published' && <button disabled={busy === p.id || !!busy} onClick={() => void setStatus(p, 'published')} style={action}>审核通过并发布</button>}
          {p.status !== 'hidden' && <button disabled={busy === p.id || !!busy} onClick={() => void setStatus(p, 'hidden')} style={action}>隐藏内容</button>}
          {p.status !== 'rejected' && <button disabled={busy === p.id || !!busy} onClick={() => void setStatus(p, 'rejected')} style={dangerAction}>拒绝投稿</button>}
          {p.status !== 'pending' && <button disabled={busy === p.id || !!busy} onClick={() => void setStatus(p, 'pending')} style={action}>退回待审核</button>}
        </div>
        {busy === p.id && <div style={{ color: '#aab5d1', fontSize: 11, marginTop: 8 }}>正在保存更改…</div>}
      </article>)}
    </div>
  </section>;
}

const panel: React.CSSProperties = {
  background: 'linear-gradient(145deg,#171e33,#0d1222)',
  border: '1px solid #ffffff18', borderRadius: 16, padding: 15, marginBottom: 12,
};
const statCard: React.CSSProperties = {
  border: '1px solid #ffffff12', borderRadius: 12, padding: '10px 12px',
  background: '#ffffff06', minWidth: 0,
};
const searchInput: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '11px 12px',
  borderRadius: 12, border: '1px solid #ffffff18', background: '#ffffff08',
  color: '#fff', fontSize: 13, outline: 'none',
};
const filterButton: React.CSSProperties = {
  border: '1px solid #ffffff18', borderRadius: 999, padding: '8px 11px',
  color: '#fff', fontSize: 12, cursor: 'pointer',
};
const postCard: React.CSSProperties = {
  border: '1px solid #ffffff18', borderRadius: 15, background: '#11182b', padding: 14,
  boxShadow: '0 8px 24px #0003',
};
const identityBox: React.CSSProperties = {
  border: '1px solid #ffffff12', borderRadius: 12, padding: '10px 11px', background: '#ffffff05',
};
const tag: React.CSSProperties = {
  border: '1px solid #ffffff16', background: '#ffffff08', borderRadius: 999,
  padding: '4px 8px', color: '#c5d3f5', fontSize: 10,
};
const action: React.CSSProperties = {
  border: '1px solid #ffffff20', borderRadius: 10, padding: '9px 11px',
  background: '#ffffff0d', color: '#eef0ff', fontSize: 12, cursor: 'pointer',
};
const dangerAction: React.CSSProperties = {
  ...action, borderColor: '#ff879633', background: '#ff879610', color: '#ffb5c1',
};
