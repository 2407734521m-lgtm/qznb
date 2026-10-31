import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';

/** 我的通知 */
export default function MeNotifications() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  async function load() {
    setLoading(true); setLoadError('');
    const { data, error } = await supabase.from('notifications')
      .select('id, type, title, body, link, is_read, created_at')
      .eq('profile_id', me).order('created_at', { ascending: false }).limit(30);
    if (error) setLoadError(error.code === '42501' || error.code === 'PGRST301'
      ? '当前账号没有读取通知的权限。' : '通知暂时加载失败，请稍后重试。');
    else setList(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // 打开即标已读
    (async () => {
      await supabase.from('notifications').update({ is_read: true }).eq('profile_id', me).eq('is_read', false);
      window.dispatchEvent(new Event('notif-read'));
    })();
  }, []);

  const typeLabel: Record<string, string> = { comment: '评论', like: '点赞', greeting: '留言', notice: '公告', love_wall: '表白墙' };

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <BackButton fallback="/me" />
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>我的通知</h2>
      {loading && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>正在加载通知…</div>}
      {!loading && loadError && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '24px 14px' }}>{loadError}<button className="mini ghost" onClick={load}>重试</button></div>}
      {!loading && !loadError && list.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>暂无通知记录</div>}
      {list.map(n => (
        <div key={n.id} className="card" style={{ opacity: n.is_read ? 0.75 : 1, cursor: n.link ? 'pointer' : 'default' }}
          onClick={() => { if (n.link) nav(n.link); }}>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f', flexShrink: 0 }} />}
            <span style={{ fontSize: 14, fontWeight: 700 }}>{n.title}</span>
            {n.type && typeLabel[n.type] && <span style={{ fontSize: 10.5, color: 'var(--mut)', border: '1px solid #ffffff1c', borderRadius: 99, padding: '1px 8px' }}>{typeLabel[n.type]}</span>}
          </div>
          {n.body && <div style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6 }}>{n.body}</div>}
          <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 6 }}>{(n.created_at || '').slice(0, 16).replace('T', ' ')}</div>
        </div>
      ))}
    </div>
  );
}
