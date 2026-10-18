import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';

/** 个人中心聚合：入口式，不再是长页面 */
export default function MeHub() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const avUrl = useSignedUrl('avatars', avatar);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('display_name, username, avatar_path').eq('id', me).maybeSingle();
      if (data) { setName((data as any).display_name || (data as any).username || ''); setAvatar((data as any).avatar_path ?? null); }
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('profile_id', me).eq('is_read', false);
      setUnread(count ?? 0);
    })();
  }, [me]);

  const entries: [string, string][] = [
    ['我的主页', `/members/${me}`],
    ['编辑资料', '/me/edit?sec=base'],
    ['主页装修', '/me/edit?sec=look'],
    ['我的动态', '/me/posts'],
    ['我的收藏', '/me/favorites'],
    ['我的相册', '/feed'],
    ['我的留言', '/me/greetings'],
    ['我的通知', '/me/notifications'],
    ['隐私设置', '/me/edit?sec=priv'],
  ];

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
          background: avUrl ? `url(${avUrl}) center/cover` : 'linear-gradient(135deg,#5b8cff,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800, color: '#fff',
        }}>{!avUrl && (name || '?').slice(0, 1)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{name || '我'}</div>
          <div style={{ fontSize: 12, color: 'var(--mut)' }}>个人中心</div>
        </div>
        {unread > 0 && <span style={{
          fontSize: 11, color: '#fff', background: '#ff4d4f', borderRadius: 999,
          padding: '3px 10px', fontWeight: 700,
        }}>{unread} 条未读</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {entries.map(([label, to]) => (
          <button key={label} onClick={() => nav(to)} className="card"
            style={{ margin: 0, padding: '18px 4px', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff', position: 'relative' }}>
            {label}
            {label === '我的通知' && unread > 0 && <span style={{
              position: 'absolute', top: 8, right: 8, width: 8, height: 8,
              borderRadius: '50%', background: '#ff4d4f',
            }} />}
          </button>
        ))}
      </div>
      <div className="card row" style={{ justifyContent: 'space-between', marginTop: 12, cursor: 'pointer' }}
        onClick={() => nav('/me/account')}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>账号安全</span>
        <span style={{ fontSize: 12.5, color: 'var(--mut)' }}>修改密码 · 退出登录 ›</span>
      </div>
    </div>
  );
}
