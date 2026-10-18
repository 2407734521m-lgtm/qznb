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

  const btn: React.CSSProperties = {
    margin: 0, padding: '16px 4px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
    color: '#fff', textShadow: '0 1px 8px #000a',
    background: 'linear-gradient(160deg,#1a2140,#0e1428)',
    border: '1px solid #ffffff14', borderRadius: 14,
    boxShadow: '0 6px 20px #0007, inset 0 1px 0 #ffffff14',
    fontFamily: 'inherit',
  };
  const headCard: React.CSSProperties = {
    background: 'linear-gradient(160deg,#1a2140,#0e1428)',
    border: '1px solid #ffffff14', borderRadius: 16, padding: 14, marginBottom: 12,
    boxShadow: '0 8px 28px #0008', display: 'flex', alignItems: 'center', gap: 12,
  };

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <div style={headCard}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', flexShrink: 0, padding: 2,
          background: 'linear-gradient(135deg,#5b8cff,#8b5cf6)',
        }}>
          <div style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: avUrl ? `url(${avUrl}) center/cover #141a30` : 'linear-gradient(135deg,#2a3560,#141a35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, color: '#fff',
          }}>{!avUrl && (name || '我').slice(0, 1)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{name || '我'}</div>
          <div style={{ fontSize: 12, color: '#8b93b0' }}>个人中心</div>
        </div>
        {unread > 0 && <span style={{
          fontSize: 11, color: '#fff', background: '#ff4d4f', borderRadius: 999,
          padding: '3px 10px', fontWeight: 700, boxShadow: '0 0 10px #ff4d4f88',
        }}>{unread} 条未读</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {entries.map(([label, to]) => (
          <button key={label} onClick={() => nav(to)} style={{ ...btn, position: 'relative' }}>
            {label}
            {label === '我的通知' && unread > 0 && <span style={{
              position: 'absolute', top: 8, right: 8, width: 8, height: 8,
              borderRadius: '50%', background: '#ff4d4f', boxShadow: '0 0 6px #ff4d4f',
            }} />}
          </button>
        ))}
      </div>
      <div onClick={() => nav('/me/account')} style={{
        ...headCard, marginTop: 12, marginBottom: 0, cursor: 'pointer', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>账号安全</span>
        <span style={{ fontSize: 12.5, color: '#8b93b0' }}>修改密码 · 退出登录 ›</span>
      </div>
    </div>
  );
}
