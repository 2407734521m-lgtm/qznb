import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ProfileAdminIdentity as Profile } from '../types/profile';
import { confirmDialog } from '../lib/dialog';

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
  const [people, setPeople] = useState<Profile[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [allRecipients, setAllRecipients] = useState(true);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeLink, setNoticeLink] = useState('/me/notifications');
  const [sending, setSending] = useState(false);

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
    const { data: joinedPeople, error: peopleListError } = await supabase
      .from('profiles')
      .select('id,username,display_name,real_name')
      .eq('joined', true)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!peopleListError) setPeople((joinedPeople || []) as Profile[]);
    const ids = [...new Set(next.map(n => n.profile_id).filter(Boolean))];
    if (ids.length) {
      const { data: people, error: peopleError } = await supabase
        .from('profiles')
        .select('id,username,display_name,real_name')
        .in('id', ids);
      if (!peopleError) {
        setProfiles(Object.fromEntries((people || []).map(p => [p.id, p])));
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

  const filteredPeople = useMemo(() => {
    const q = recipientQuery.trim().toLocaleLowerCase();
    return people.filter(p => !q || [p.username, p.display_name, p.real_name, p.id]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(q));
  }, [people, recipientQuery]);

  function toggleRecipient(id: string) {
    if (selectedRecipients.includes(id)) {
      setSelectedRecipients(current => current.filter(value => value !== id));
      return;
    }
    if (selectedRecipients.length >= 100) {
      setMsg('指定收件人最多 100 个。');
      return;
    }
    setSelectedRecipients(current => [...current, id]);
  }

  async function sendNotification() {
    if (!noticeTitle.trim() || noticeTitle.trim().length > 120) return setMsg('通知标题需填写，且不超过 120 字。');
    if (!noticeBody.trim() || noticeBody.trim().length > 2000) return setMsg('通知正文需填写，且不超过 2000 字。');
    const link = noticeLink.trim() || '/me/notifications';
    if (!link.startsWith('/') || link.startsWith('//') || link.length > 300) return setMsg('跳转地址必须是站内相对路径。');
    if (!allRecipients && !selectedRecipients.length) return setMsg('请先选择收件成员。');
    const recipientCount = allRecipients ? people.length : selectedRecipients.length;
    if (allRecipients && recipientCount > 1000) return setMsg('全体发送人数超过 1000，请改为分批指定成员。');
    if (!(await confirmDialog(
      '确认向' + (allRecipients ? '全部已加入成员' : '选中的 ' + recipientCount + ' 位成员')
      + '发送站内通知？发送后无法撤回。',
      { confirmText: '确认发送' },
    ))) return;

    setSending(true);
    const { data: sent, error } = await supabase.rpc('admin_send_notification_campaign', {
      p_title: noticeTitle.trim(),
      p_body: noticeBody.trim(),
      p_link: link,
      p_recipient_ids: allRecipients ? null : selectedRecipients,
    });
    setSending(false);
    if (error) {
      setMsg('发送站内通知失败：' + error.message);
      return;
    }
    setMsg('站内通知已创建，成功写入 ' + sent + ' 位成员的通知列表。手机推送或邮件送达不在本功能范围内。');
    setNoticeTitle('');
    setNoticeBody('');
    setNoticeLink('/me/notifications');
    setSelectedRecipients([]);
    setComposeOpen(false);
    await load();
  }

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <h2 style={{ margin: '0 0 5px', fontSize: 16 }}>发送站内通知</h2>
          <p style={{ margin: 0, color: '#aab5d1', fontSize: 11, lineHeight: 1.6 }}>通知会出现在成员的通知中心，不代表系统推送或邮件送达。</p>
        </div>
        <button style={button} onClick={() => setComposeOpen(value => !value)}>{composeOpen ? '收起' : '新建通知'}</button>
      </div>
      {composeOpen && <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#d7e0f8' }}>
          <input type="checkbox" checked={allRecipients} onChange={e => setAllRecipients(e.target.checked)} />
          发送给全部已加入成员（最多 1000 人）
        </label>
        {!allRecipients && <>
          <input value={recipientQuery} onChange={e => setRecipientQuery(e.target.value)} placeholder="搜索昵称、用户名…" style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid #ffffff20', background: '#080d1c', color: '#fff' }} />
          <div style={{ color: '#aab5d1', fontSize: 11 }}>已选 {selectedRecipients.length}/100 人</div>
          <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #ffffff16', borderRadius: 10, padding: '4px 9px' }}>
            {filteredPeople.map(person => <label key={person.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #ffffff0c', fontSize: 12 }}>
              <input type="checkbox" checked={selectedRecipients.includes(person.id)} onChange={() => toggleRecipient(person.id)} />
              <span>{person.display_name || person.real_name || person.username || '未命名成员'} <small style={{ color: '#8994b2' }}>@{person.username || person.id.slice(0, 8)}</small></span>
            </label>)}
            {!filteredPeople.length && <div style={{ color: '#8994b2', fontSize: 11, padding: 8 }}>没有匹配成员。</div>}
          </div>
        </>}
        <input value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} maxLength={120} placeholder="通知标题（最多 120 字）" style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid #ffffff20', background: '#080d1c', color: '#fff' }} />
        <textarea value={noticeBody} onChange={e => setNoticeBody(e.target.value)} maxLength={2000} rows={4} placeholder="通知正文（最多 2000 字）" style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid #ffffff20', background: '#080d1c', color: '#fff', resize: 'vertical' }} />
        <input value={noticeLink} onChange={e => setNoticeLink(e.target.value)} maxLength={300} placeholder="站内跳转路径，例如 /me/notifications" style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid #ffffff20', background: '#080d1c', color: '#fff' }} />
        <button style={{ ...button, background: '#687cff', opacity: sending ? .6 : 1 }} disabled={sending} onClick={() => void sendNotification()}>{sending ? '发送中…' : '确认发送站内通知'}</button>
      </div>}
    </div>
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>站内通知中心</h2>
          <p style={{ margin: 0, color: '#aab5d1', fontSize: 12, lineHeight: 1.65 }}>
            查看现有通知的创建与已读状态。此处的“已创建”不代表手机推送或邮件一定送达。
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
      <div style={{ color: '#8491b1', fontSize: 11, marginTop: 9 }}>最近最多 200 条记录；发送操作只新增站内通知，不修改或删除历史通知。</div>
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
