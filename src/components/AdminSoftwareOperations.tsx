import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { card, h3, mut } from '../pages/admin/shared';
import { confirmDialog } from '../lib/dialog';

type ClientMember = {
  id: string;
  username: string;
  display_name: string | null;
  client_platform: 'mobile' | 'web' | 'unknown';
  device: string | null;
  app_version_name: string | null;
  app_version_code: number | null;
  presence_updated_at: string | null;
};
type Announcement = {
  id: number;
  title: string;
  body: string;
  show_popup: boolean;
  is_published: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
};
type Release = {
  id: number;
  version_name: string;
  version_code: number;
  update_notes: string;
  force_update: boolean;
  min_code: number;
  published_at: string;
};
type Filter = 'all' | 'mobile' | 'web' | 'unknown';

const control: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--admin-border, #dce3ed)',
  borderRadius: 11, padding: '10px 12px', background: 'var(--admin-surface-muted, #f8fafc)',
  color: 'var(--admin-text, #172033)', fontSize: 13, outline: 'none',
};
const action: React.CSSProperties = {
  border: '1px solid var(--admin-border, #dce3ed)', borderRadius: 10,
  padding: '8px 11px', background: 'var(--admin-surface-muted, #f8fafc)',
  color: 'var(--admin-text, #172033)', fontSize: 12, fontWeight: 650, cursor: 'pointer',
};
const label: React.CSSProperties = { display: 'block', color: 'var(--admin-muted, #64748b)', fontSize: 11.5, fontWeight: 650, marginBottom: 6 };
const small: React.CSSProperties = { ...mut, fontSize: 11.5 };
const when = (value?: string | null) => value ? new Date(value).toLocaleString() : '暂无记录';

function platformName(value: ClientMember['client_platform']) {
  return value === 'mobile' ? '移动端软件' : value === 'web' ? '网页版' : '待识别';
}
function platformStyle(value: ClientMember['client_platform']) {
  return value === 'mobile'
    ? { color: '#16835d', background: '#16835d12', border: '#16835d35' }
    : value === 'web'
      ? { color: '#4567a9', background: '#4567a912', border: '#4567a935' }
      : { color: '#8b6b35', background: '#8b6b3512', border: '#8b6b3535' };
}

export default function AdminSoftwareOperations({ setMsg }: { setMsg: (message: string) => void }) {
  const [members, setMembers] = useState<ClientMember[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [popup, setPopup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [memberResult, announcementResult, releaseResult] = await Promise.all([
      supabase.rpc('admin_client_platform_members'),
      supabase.rpc('admin_list_app_announcements'),
      supabase.rpc('admin_list_app_releases'),
    ]);
    setMembers((memberResult.data ?? []) as ClientMember[]);
    setAnnouncements((announcementResult.data ?? []) as Announcement[]);
    setReleases((releaseResult.data ?? []) as Release[]);
    setLoading(false);
    const errors = [memberResult.error, announcementResult.error, releaseResult.error].filter(Boolean);
    if (errors.length) setMsg('软件管理数据读取失败：' + errors.map(error => error?.message).join('；'));
  }, [setMsg]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    mobile: members.filter(item => item.client_platform === 'mobile').length,
    web: members.filter(item => item.client_platform === 'web').length,
    unknown: members.filter(item => item.client_platform === 'unknown').length,
  }), [members]);
  const visibleMembers = useMemo(
    () => filter === 'all' ? members : members.filter(item => item.client_platform === filter),
    [filter, members],
  );

  async function publish() {
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || cleanTitle.length > 100) return setMsg('公告标题需要在 1～100 个字符之间。');
    if (!cleanBody || cleanBody.length > 3000) return setMsg('公告内容需要在 1～3000 个字符之间。');
    const ok = await confirmDialog(
      '这条公告仅发给最近使用移动端软件的正式成员。当前识别到 ' + counts.mobile + ' 位，确认发布吗？',
      { confirmText: '发布给软件成员' },
    );
    if (!ok) return;

    setBusy(true);
    const { data, error } = await supabase.rpc('admin_create_app_announcement', {
      p_title: cleanTitle,
      p_body: cleanBody,
      p_show_popup: popup,
      p_expires_at: null,
    });
    setBusy(false);
    if (error) return setMsg('发布失败：' + error.message);
    const result = data as { recipient_count?: number } | null;
    setTitle('');
    setBody('');
    await load();
    setMsg('软件公告已发布，已向 ' + (result?.recipient_count ?? 0) + ' 位软件成员发送站内消息。');
  }

  async function setStatus(item: Announcement) {
    const next = !item.is_published;
    const ok = await confirmDialog(
      next ? '重新发布这条软件公告？' : '撤下这条公告？撤下后软件端不再显示弹窗。',
      { confirmText: next ? '重新发布' : '撤下公告', danger: !next },
    );
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_app_announcement_status', {
      p_announcement_id: item.id,
      p_is_published: next,
    });
    setBusy(false);
    if (error) return setMsg('公告状态更新失败：' + error.message);
    setMsg(next ? '公告已重新发布。' : '公告已撤下。');
    await load();
  }

  return <div style={{ display: 'grid', gap: 12 }}>
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h3 style={{ ...h3, marginBottom: 4 }}>软件成员与平台</h3>
          <p style={{ ...small, margin: 0 }}>显示每位成员最近一次登录时使用的客户端类型。</p>
        </div>
        <button style={action} disabled={loading || busy} onClick={() => void load()}>{loading ? '刷新中…' : '刷新'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 7, marginTop: 12 }}>
        {([
          ['移动端软件', counts.mobile, '#16835d'],
          ['网页版', counts.web, '#4567a9'],
          ['待识别', counts.unknown, '#8b6b35'],
        ] as const).map(([name, count, color]) => <div key={name} style={{ background: 'var(--admin-surface-muted, #f8fafc)', border: '1px solid var(--admin-border, #e2e8f0)', borderRadius: 11, padding: 9 }}>
          <div style={{ ...small, color }}>{name}</div>
          <strong style={{ display: 'block', fontSize: 21, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{count}</strong>
        </div>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 4px' }}>
        {([
          ['all', '全部'],
          ['mobile', '移动端软件'],
          ['web', '网页版'],
          ['unknown', '待识别'],
        ] as const).map(([value, name]) => <button key={value} style={{
          ...action,
          borderColor: filter === value ? '#8aa5e8' : undefined,
          color: filter === value ? '#315ca8' : undefined,
          background: filter === value ? '#edf3ff' : undefined,
        }} aria-pressed={filter === value} onClick={() => setFilter(value)}>{name}</button>)}
      </div>
      {visibleMembers.map(member => {
        const tone = platformStyle(member.client_platform);
        return <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 0', borderTop: '1px solid var(--admin-border, #e2e8f0)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 750, overflowWrap: 'anywhere' }}>{member.display_name || member.username}</div>
            <div style={small}>@{member.username} · {member.device || '设备信息待采集'}</div>
            <div style={small}>最近活动：{when(member.presence_updated_at)}</div>
            {member.client_platform === 'mobile' && <div style={small}>软件版本：{member.app_version_name || '旧版 / 未上报'} · {member.app_version_code ?? '—'}</div>}
          </div>
          <span style={{ flexShrink: 0, fontSize: 10.5, padding: '5px 8px', borderRadius: 999, border: '1px solid ' + tone.border, background: tone.background, color: tone.color, fontWeight: 750 }}>{platformName(member.client_platform)}</span>
        </div>;
      })}
      {!loading && visibleMembers.length === 0 && <p style={small}>当前筛选下没有成员。</p>}
    </section>

    <section style={card}>
      <h3 style={h3}>发布软件公告</h3>
      <p style={{ ...small, marginTop: -3 }}>公告只发送给最近使用移动端软件的正式成员；网页版用户不会收到这类软件专属公告。</p>
      <label style={label}>公告标题</label>
      <input style={control} value={title} maxLength={100} onChange={event => setTitle(event.target.value)} placeholder="例如：移动端新版本已开放" />
      <label style={{ ...label, marginTop: 11 }}>公告内容</label>
      <textarea style={{ ...control, minHeight: 120, resize: 'vertical' }} value={body} maxLength={3000} onChange={event => setBody(event.target.value)} placeholder="填写公告内容…" />
      <button type="button" style={{ ...action, marginTop: 10, color: popup ? '#315ca8' : undefined, borderColor: popup ? '#8aa5e8' : undefined }} onClick={() => setPopup(value => !value)}>
        {popup ? '弹窗提醒：开启' : '弹窗提醒：关闭（仅消息通知）'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="mini" disabled={busy} onClick={() => void publish()}>{busy ? '发布中…' : '发布给软件成员'}</button>
      </div>
    </section>

    <section style={card}>
      <h3 style={h3}>软件公告记录</h3>
      {announcements.length ? announcements.map(item => <article key={item.id} style={{ borderTop: '1px solid var(--admin-border, #e2e8f0)', padding: '10px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 13.5 }}>{item.title}</strong>
          <span style={{ color: item.is_published ? '#16835d' : '#8a6470', fontSize: 10.5 }}>{item.is_published ? '已发布' : '已撤下'}</span>
        </div>
        <div style={small}>{when(item.published_at || item.created_at)} · {item.show_popup ? '弹窗公告' : '普通消息'}</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '7px 0', overflowWrap: 'anywhere' }}>{item.body}</p>
        <button style={action} disabled={busy} onClick={() => void setStatus(item)}>{item.is_published ? '撤下公告' : '重新发布'}</button>
      </article>) : <p style={small}>暂无软件公告。</p>}
    </section>

    <section style={card}>
      <h3 style={h3}>软件版本发布历史</h3>
      {releases.length ? releases.map(item => <div key={item.id} style={{ borderTop: '1px solid var(--admin-border, #e2e8f0)', padding: '10px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 13.5 }}>{item.version_name} · #{item.version_code}</strong>
          <span style={small}>{when(item.published_at)}</span>
        </div>
        <div style={small}>{item.force_update ? '强制更新' : '普通更新'} · 最低版本 {item.min_code}</div>
        <div style={{ ...small, whiteSpace: 'pre-wrap' }}>{item.update_notes || '无更新说明'}</div>
      </div>) : <p style={small}>暂无通过新版发布操作生成的记录。</p>}
    </section>
  </div>;
}
