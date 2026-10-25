import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Notice = {
  id: string | number;
  profile_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};
type Profile = { id: string; username: string | null; display_name: string | null; real_name: string | null };

const panel: React.CSSProperties = {
  background: 'linear-gradient(145deg,#171e33,#0d1222)',
  border: '1px solid #ffffff18', borderRadius: 16, padding: 15, marginBottom: 12,
};
const button: React.CSSProperties = {
  border: '1px solid #ffffff20', borderRadius: 10, padding: '9px 11px',
  background: '#ffffff0d', color: '#eef0ff', fontSize: 12, cursor: 'pointer',
};
const typeLabels: Record<string, string> = {
  comment: '评论', like: '点赞', greeting: '留言', notice: '公告',
  love: '表白', love_wall: '表白墙', system: '系统',
};

export default function AdminNotificationCenter({ setMsg }: { setMsg: (s: string) => void }) {
  const [rows, setRows] = useState<Notice[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg('');
    const { data, error } = await supabase
      .from('notifications')
      .select('id,profile_id,type,title,body,link,is_read,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      setMsg('通知中心读取失败：当前管理员可能没有 notifications 表的读取权限。为保护用户隐私，本页不会尝试绕过数据库权限。');
      setLoading(false);
      setLoaded(true);
      return;
    }
    const next = (data || []) as Notice[];
    setRows(next);
    const ids = [...new Set(next.map(n => n.profile_id).filter(Boolean))];
    if (ids.length) {
      const { data: people, error: peopleError } = await supabase
        .from('profiles')
        .select('id,username,display_name,real_name')
        .in('id', ids);
      if (!peopleError) {
        setProfiles(Object.fromEntries(((people || []) as Profile[]).map(p => [p.id, p])));
      }
    } else setProfiles({});
    setLoading(false);
    setLoaded(true);
  }, [setMsg]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: rows.length,
    unread: rows.filter(n => !n.is_read).length,
    read: rows.filter(n => n.is_read).length,
  }), [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return rows.filter(n => {
      if (filter === 'unread' && n.is_read) return false;
      if (filter === 'read' && !n.is_read) return false;
      if (!q) return true;
      const p = profiles[n.profile_id];
      return [n.title, n.body, n.type, n.profile_id, p?.username, p?.display_name, p?.real_name]
        .filter(Boolean).join(' ').toLocaleLowerCase().includes(q);
    });
  }, [rows, profiles, filter, query]);

  return <section>
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>站内通知中心</h2>
          <p style={{ margin: 0, color: '#aab5d1', fontSize: 12, lineHeight: 1.65 }}>
            只读查看现有通知记录，帮助排查通知是否创建、是否已读。此处的“已创建”不代表手机推送或邮件一定送达。
          </p>
        </div>
        <button style={button} disabled={loading} onClick={() => void load()}>{loading ? '刷新中…' : '刷新'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, marginTop: 14 }}>
        {[
          ['最近记录', counts.all, '#b9c9ff'],
          ['未读', counts.unread, '#f5c26b'],
          ['已读', counts.read, '#7ed9b0'],
        ].map(([label, value, color]) => <div key={String(label)} style={{ border: '1px solid #ffffff12', borderRadius: 12, padding: '10px 9px', background: '#ffffff06', minWidth: 0 }}>
          <div style={{ color: '#aab5d1', fontSize: 11 }}>{label}</div>
          <div style={{ color: String(color), fontSize: 21, fontWeight: 800, marginTop: 3 }}>{value}</div>
        </div>)}
      </div>
    </div>

    <div style={{ ...panel, padding: 12 }}>
      <input value={query} onChange={e => setQuery(e.target.value)}
        placeholder="搜索通知标题、内容、成员或账号 ID"
        aria-label="搜索通知记录"
        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '11px 12px', borderRadius: 12, border: '1px solid #ffffff18', background: '#ffffff08', color: '#fff', fontSize: 13 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {([
          ['all', '全部', counts.all],
          ['unread', '未读', counts.unread],
          ['read', '已读', counts.read],
        ] as const).map(([v, label, count]) => <button key={v} style={{ ...button, background: filter === v ? '#687cff' : '#ffffff0d' }} aria-pressed={filter === v} onClick={() => setFilter(v)}>{label} {count}</button>)}
      </div>
      <div style={{ color: '#8491b1', fontSize: 11, marginTop: 9 }}>最近最多 200 条记录；本页不发送、不删除，也不更改任何通知状态。</div>
    </div>

    {loading && <p style={{ color: '#aab5d1', textAlign: 'center', padding: 20 }}>正在读取通知记录…</p>}
    {!loading && loaded && shown.length === 0 && <p style={{ color: '#9da6c3', textAlign: 'center', padding: 24 }}>{rows.length ? '没有符合条件的通知。' : '没有可读取的通知记录，或当前账号没有读取权限。'}</p>}
    <div style={{ display: 'grid', gap: 10 }}>
      {shown.map(n => {
        const p = profiles[n.profile_id];
        return <article key={String(n.id)} style={{ ...panel, marginBottom: 0, opacity: n.is_read ? .82 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 750, fontSize: 14, overflowWrap: 'anywhere' }}>{n.title || '（无标题）'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                <span style={{ fontSize: 10, color: '#c5d3f5', border: '1px solid #ffffff16', borderRadius: 99, padding: '3px 8px' }}>{typeLabels[n.type || ''] || n.type || '未分类'}</span>
                <span style={{ fontSize: 10, color: n.is_read ? '#7ed9b0' : '#f5c26b', border: '1px solid #ffffff16', borderRadius: 99, padding: '3px 8px' }}>{n.is_read ? '已读' : '未读'}</span>
              </div>
            </div>
            <time style={{ color: '#8491b1', fontSize: 10, whiteSpace: 'nowrap' }}>{n.created_at ? new Date(n.created_at).toLocaleString() : '时间未知'}</time>
          </div>
          {n.body && <details style={{ marginTop: 10, borderTop: '1px solid #ffffff12', paddingTop: 9 }}>
            <summary style={{ cursor: 'pointer', color: '#c5d3f5', fontSize: 12 }}>展开通知内容</summary>
            <p style={{ color: '#b8bfd7', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.body}</p>
          </details>}
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', color: '#8491b1', fontSize: 11 }}>查看接收对象</summary>
            <div style={{ color: '#aab5d1', fontSize: 11, lineHeight: 1.8, overflowWrap: 'anywhere', marginTop: 6 }}>
              <div>成员：{p?.display_name || p?.real_name || p?.username || '未找到对应资料'}</div>
              <div>用户名：{p?.username || '未设置'}</div>
              <div>接收者 ID：{n.profile_id || '未知'}</div>
              <div>通知 ID：{n.id}</div>
              {n.link && <div>站内跳转：{n.link}</div>}
            </div>
          </details>
        </article>;
      })}
    </div>
  </section>;
}
