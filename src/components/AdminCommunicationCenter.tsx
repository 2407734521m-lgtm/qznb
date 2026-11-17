import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import AdminBroadcast from './AdminBroadcast';
import AdminNotificationCenter from './AdminNotificationCenter';
import AdminMemberMessageComposer from './AdminMemberMessageComposer';

type Member = { id: string; name: string; username: string };

const panel: React.CSSProperties = {
  background: 'var(--admin-surface, #fff)',
  border: '1px solid var(--admin-border, #e2e8f0)',
  borderRadius: 15,
  padding: 14,
  marginBottom: 12,
};

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--admin-border, #dbe2ea)',
  background: 'var(--admin-surface-muted, #f8fafc)',
  color: 'var(--admin-text, #172033)',
  font: 'inherit',
  fontSize: 13,
};

const action: React.CSSProperties = {
  border: '1px solid var(--admin-border, #dbe2ea)',
  borderRadius: 10,
  padding: '9px 12px',
  background: 'var(--admin-surface-muted, #f8fafc)',
  color: 'var(--admin-text, #172033)',
  fontSize: 12.5,
  cursor: 'pointer',
};

export default function AdminCommunicationCenter({
  me,
  isSuper,
  setMsg,
}: {
  me: string;
  isSuper: boolean;
  setMsg: (message: string) => void;
}) {
  const [section, setSection] = useState<'broadcast' | 'notifications' | 'member-messages'>('broadcast');
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (section !== 'member-messages' || !isSuper || members.length) return;
    let alive = true;
    setLoadingMembers(true);
    void (async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id, display_name, username')
        .eq('joined', true)
        .eq('role', 'member')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (!alive) return;
      if (error) setMsg('成员名单读取失败：' + error.message);
      else setMembers((data ?? []).map(person => ({
        id: person.id,
        name: person.display_name || person.username || '成员',
        username: person.username || '',
      })));
      setLoadingMembers(false);
    })();
    return () => { alive = false; };
  }, [section, isSuper, members.length, setMsg]);

  const shownMembers = useMemo(() => {
    const q = memberQuery.trim().toLocaleLowerCase();
    return members.filter(person => !q || `${person.name} ${person.username} ${person.id}`.toLocaleLowerCase().includes(q));
  }, [members, memberQuery]);

  const chosenRecipients = useMemo(() => {
    const selected = new Set(selectedIds);
    return members.filter(person => selected.has(person.id)).map(person => ({
      id: person.id,
      name: person.name,
    }));
  }, [members, selectedIds]);

  function toggleMember(id: string) {
    setSelectedIds(previous => {
      if (previous.includes(id)) return previous.filter(value => value !== id);
      if (previous.length >= 100) {
        setMsg('每次最多选择 100 位成员。');
        return previous;
      }
      return [...previous, id];
    });
  }

  return (
    <section className="admin-communication-center">
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 5px', fontSize: 18, color: 'var(--admin-text, #172033)' }}>沟通中心</h2>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--admin-muted, #64748b)' }}>
              统一管理成员弹窗、站内通知和定向消息。预约广播到达设定时间后，在成员下一轮页面同步时显示。
            </p>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--admin-muted, #64748b)' }}>成员触达 · 查看统计 · 历史记录</span>
        </div>
        <div role="tablist" aria-label="沟通类型" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 13 }}>
          {([
            ['broadcast', '弹窗广播与预约'],
            ['notifications', '站内通知'],
            ['member-messages', '成员消息'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={section === id}
              onClick={() => setSection(id)}
              style={{
                ...action,
                borderColor: section === id ? 'var(--admin-accent, #536bd5)' : 'var(--admin-border, #dbe2ea)',
                background: section === id ? 'var(--admin-accent-soft, #eef1ff)' : 'var(--admin-surface-muted, #f8fafc)',
                color: section === id ? 'var(--admin-accent, #3d50b4)' : 'var(--admin-text, #172033)',
                fontWeight: section === id ? 700 : 500,
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {section === 'broadcast' && <AdminBroadcast me={me} setMsg={setMsg} />}
      {section === 'notifications' && <AdminNotificationCenter setMsg={setMsg} />}
      {section === 'member-messages' && (
        <div style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: '0 0 5px', fontSize: 16, color: 'var(--admin-text, #172033)' }}>定向成员消息</h3>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--admin-muted, #64748b)' }}>
                通过成员的通知中心发送站内消息，不会冒充手机系统推送；每次最多 100 位收件人。
              </p>
            </div>
            <strong style={{ fontSize: 13, color: 'var(--admin-text, #172033)' }}>{selectedIds.length}/100 已选</strong>
          </div>
          {!isSuper ? (
            <p style={{ fontSize: 13, color: 'var(--admin-muted, #64748b)' }}>批量定向成员消息仅限超级管理员使用。</p>
          ) : (
            <>
              <input style={{ ...field, marginTop: 12 }} value={memberQuery}
                onChange={event => setMemberQuery(event.target.value)}
                placeholder="搜索成员昵称或用户名" />
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '9px 0' }}>
                <button type="button" style={action} onClick={() => setSelectedIds(previous => {
                  const next = new Set(previous);
                  shownMembers.forEach(person => { if (next.size < 100) next.add(person.id); });
                  return [...next];
                })}>选择当前筛选</button>
                <button type="button" style={action} onClick={() => setSelectedIds([])}>清空选择</button>
                <button type="button" disabled={!selectedIds.length} style={{ ...action, opacity: selectedIds.length ? 1 : .5 }}
                  onClick={() => setComposerOpen(true)}>编写成员消息</button>
              </div>
              <div style={{ maxHeight: 390, overflowY: 'auto', border: '1px solid var(--admin-border, #e2e8f0)', borderRadius: 11, padding: '4px 10px' }}>
                {loadingMembers && <p style={{ color: 'var(--admin-muted, #64748b)', fontSize: 12 }}>正在加载已加入成员…</p>}
                {!loadingMembers && shownMembers.map(person => (
                  <label key={person.id} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '8px 1px', borderBottom: '1px solid var(--admin-border, #edf0f4)', fontSize: 13, color: 'var(--admin-text, #172033)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedIds.includes(person.id)} onChange={() => toggleMember(person.id)} />
                    <span style={{ flex: 1 }}>{person.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--admin-muted, #64748b)' }}>@{person.username || '—'}</span>
                  </label>
                ))}
                {!loadingMembers && shownMembers.length === 0 && <p style={{ fontSize: 12, color: 'var(--admin-muted, #64748b)' }}>没有符合条件的成员。</p>}
              </div>
            </>
          )}
          {composerOpen && chosenRecipients.length > 0 && (
            <AdminMemberMessageComposer
              recipients={chosenRecipients}
              onClose={() => setComposerOpen(false)}
              setMsg={setMsg}
            />
          )}
        </div>
      )}
    </section>
  );
}
