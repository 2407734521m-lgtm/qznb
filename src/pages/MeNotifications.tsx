import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';

/** 通知中心：明确区分未读状态，由用户决定逐条或批量标记已读。 */
export default function MeNotifications() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [actionBusy, setActionBusy] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const syncLocal = () => {
      try {
        const raw = JSON.parse(localStorage.getItem('qznb_user_preferences_v1:' + me) || 'null');
        setNotificationPrefs(raw?.notifications && typeof raw.notifications === 'object' ? raw.notifications : {});
      } catch { setNotificationPrefs({}); }
    };
    const syncCloud = async () => {
      const { data, error } = await (supabase as any)
        .from('profile_notification_preferences')
        .select('preferences')
        .eq('profile_id', me)
        .maybeSingle();
      if (!active || error || !data?.preferences?.notifications) return;
      setNotificationPrefs(data.preferences.notifications);
      try {
        const raw = JSON.parse(localStorage.getItem('qznb_user_preferences_v1:' + me) || 'null');
        localStorage.setItem('qznb_user_preferences_v1:' + me, JSON.stringify({
          ...(raw && typeof raw === 'object' ? raw : {}),
          notifications: data.preferences.notifications,
        }));
      } catch { /* 云端仍是主数据源；本地缓存不可用不影响通知过滤 */ }
    };
    syncLocal();
    void syncCloud();
    window.addEventListener('qznb-settings-changed', syncLocal);
    window.addEventListener('focus', syncCloud);
    return () => {
      active = false;
      window.removeEventListener('qznb-settings-changed', syncLocal);
      window.removeEventListener('focus', syncCloud);
    };
  }, [me]);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.from('notifications')
        .select('id, type, title, body, link, is_read, created_at')
        .eq('profile_id', me)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        setLoadError(error.code === '42501' || error.code === 'PGRST301'
          ? '当前账号没有读取通知的权限。'
          : '通知暂时加载失败，请稍后重试。');
      } else {
        setList(data ?? []);
      }
    } catch {
      setLoadError('网络暂时不可用，请检查连接后重试。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [me]);

  async function markRead(id: number) {
    const item = list.find(entry => entry.id === id);
    if (!item || item.is_read) return true;
    const { error } = await supabase.from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('profile_id', me);
    if (error) {
      setActionError('标记已读失败，请稍后重试。');
      return false;
    }
    setList(current => current.map(entry => entry.id === id ? { ...entry, is_read: true } : entry));
    window.dispatchEvent(new Event('notif-read'));
    return true;
  }

  async function openNotification(item: any) {
    setActionError('');
    await markRead(item.id);
    const target = typeof item.link === 'string' ? item.link.trim() : '';
    // 通知只允许站内相对路径，避免数据库内容意外触发外部跳转。
    if (target.startsWith('/') && !target.startsWith('//')) nav(target);
  }

  async function markAllRead() {
    if (actionBusy || unreadCount === 0) return;
    setActionBusy(true);
    setActionError('');
    const { error } = await supabase.from('notifications')
      .update({ is_read: true })
      .eq('profile_id', me)
      .eq('is_read', false);
    if (error) {
      setActionError('批量标记失败，请稍后重试。');
    } else {
      setList(current => current.map(item => ({ ...item, is_read: true })));
      window.dispatchEvent(new Event('notif-read'));
    }
    setActionBusy(false);
  }

  const unreadCount = list.filter(item => !item.is_read).length;
  const visibleList = list.filter(item => notificationPrefs[item.type] !== false)
    .filter(item => filter === 'unread' ? !item.is_read : true);
  const typeLabel: Record<string, string> = {
    comment: '评论', like: '点赞', greeting: '留言', notice: '公告', love_wall: '表白墙', feedback: '反馈进度',
  };

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <BackButton fallback="/me" />
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <h2 style={{ margin: '2px 0 4px', fontSize: 20 }}>通知中心</h2>
            <div style={{ color: 'var(--mut)', fontSize: 12 }}>
              {unreadCount > 0 ? unreadCount + ' 条未读通知' : '目前没有未读通知'}
            </div>
          </div>
          <button className="mini ghost" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" className={filter === 'all' ? 'mini pri' : 'mini ghost'}
            onClick={() => setFilter('all')}>全部（{list.length}）</button>
          <button type="button" className={filter === 'unread' ? 'mini pri' : 'mini ghost'}
            onClick={() => setFilter('unread')}>未读（{unreadCount}）</button>
          <button type="button" className="mini ghost" style={{ marginLeft: 'auto' }}
            onClick={() => void markAllRead()} disabled={actionBusy || unreadCount === 0}>
            {actionBusy ? '处理中…' : '全部标为已读'}
          </button>
        </div>
        {actionError && <p className="err" role="alert" style={{ margin: '10px 0 0' }}>{actionError}</p>}
      </div>

      {loading && <div className="card" role="status" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>正在加载通知…</div>}
      {!loading && loadError && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '24px 14px' }}>
          {loadError}
          <button className="mini ghost" type="button" onClick={() => void load()}>重试</button>
        </div>
      )}
      {!loading && !loadError && visibleList.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>
          {filter === 'unread' ? '没有未读通知' : '暂无通知记录'}
        </div>
      )}
      {!loading && !loadError && visibleList.map(item => (
        <article
          key={item.id}
          className="card"
          role="button"
          tabIndex={0}
          aria-label={(item.is_read ? '' : '未读，') + (item.title || '通知') + '，打开通知'}
          onClick={() => void openNotification(item)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              void openNotification(item);
            }
          }}
          style={{
            cursor: 'pointer',
            borderColor: item.is_read ? undefined : 'rgba(100,160,255,.35)',
            boxShadow: item.is_read ? undefined : '0 8px 24px rgba(40,100,180,.10)',
          }}
        >
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 5 }}>
            {!item.is_read && <span aria-label="未读" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff626d', flexShrink: 0 }} />}
            <span style={{ minWidth: 0, flex: 1, fontSize: 14, fontWeight: 700 }}>{item.title || '通知'}</span>
            {item.type && typeLabel[item.type] && (
              <span style={{ fontSize: 10.5, color: 'var(--mut)', border: '1px solid #ffffff1c', borderRadius: 99, padding: '1px 8px' }}>
                {typeLabel[item.type]}
              </span>
            )}
          </div>
          {item.body && <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{item.body}</div>}
          <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 8 }}>
            {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
            {!item.is_read && <span style={{ marginLeft: 8, color: '#ff929a' }}>未读</span>}
          </div>
        </article>
      ))}
    </div>
  );
}
