import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';

/** 个人中心：列表式重设计（只改样子，跳转和数据都不变） */
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

  // [图标, 标题, 小字说明, 跳转, 图标底色]
  const entries: [string, string, string, string, string][] = [
    ['🏠', '我的主页', '别人看到的你的样子', `/members/${me}`, '#e8f0ff'],
    ['✏️', '编辑资料', '名字、签名、爱好', '/me/edit?sec=base', '#fff1d6'],
    ['🎨', '主页装修', '背景、主题、排版', '/me/edit?sec=look', '#ffe8f1'],
    ['✨', '我的动态', '你发过的所有动态', '/me/posts', '#e6f7ee'],
    ['⭐', '我的收藏', '收藏过的内容', '/me/favorites', '#fff7d6'],
    ['📸', '我的相册', '照片都在动态里', '/feed', '#e8f4ff'],
    ['💌', '我的留言', '收到的留言', '/me/greetings', '#ffeef5'],
    ['🔔', '我的通知', unread > 0 ? `${unread} 条未读` : '没有新通知', '/me/notifications', '#f0eaff'],
    ['🔒', '隐私设置', '谁能看到你的资料', '/me/edit?sec=priv', '#eef2f6'],
  ];

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      {/* 头部：渐变横幅 + 大头像 + 名字 */}
      <div style={{
        borderRadius: 20, padding: '20px 16px 16px', marginBottom: 14, overflow: 'hidden',
        background: 'linear-gradient(135deg,#ff8fab 0%,#a78bfa 55%,#5b8cff 100%)',
        boxShadow: '0 12px 32px rgba(139,92,246,.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 68, height: 68, borderRadius: '50%', flexShrink: 0, padding: 3, background: 'rgba(255,255,255,.85)',
          }}>
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%',
              background: avUrl ? `url(${avUrl}) center/cover #141a30` : 'linear-gradient(135deg,#ff8fab,#5b8cff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 800, color: '#fff',
            }}>{!avUrl && (name || '我').slice(0, 1)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: '#fff', textShadow: '0 1px 10px rgba(0,0,0,.3)' }}>{name || '我'}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.9)', marginTop: 2 }}>个人中心 · 青春档案</div>
          </div>
          {unread > 0 && <span style={{
            fontSize: 12, color: '#e11d48', background: '#fff', borderRadius: 999,
            padding: '4px 12px', fontWeight: 700, flexShrink: 0,
          }}>{unread} 条未读</span>}
        </div>
      </div>

      {/* 入口列表：一行一项，图标 + 标题 + 小字 + 箭头 */}
      <div className="card" style={{ padding: '4px 14px' }}>
        {entries.map(([ic, label, sub, to, bg], i) => (
          <button key={label} onClick={() => nav(to)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            background: 'none', border: 0, borderBottom: i === entries.length - 1 ? 0 : '1px solid rgba(255,255,255,.08)',
            padding: '13px 0', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{label}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--mut)', marginTop: 1 }}>{sub}</span>
            </span>
            {label === '我的通知' && unread > 0 && <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f', flexShrink: 0,
            }} />}
            <span style={{ color: 'var(--mut)', fontSize: 16, flexShrink: 0 }}>›</span>
          </button>
        ))}
      </div>

      {/* 账号安全：单独一行 */}
      <button onClick={() => nav('/me/account')} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16,
        padding: '14px 16px', marginTop: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
      }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>账号安全</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--mut)', marginTop: 1 }}>修改密码 · 退出登录</span>
        </span>
        <span style={{ color: 'var(--mut)', fontSize: 16 }}>›</span>
      </button>
    </div>
  );
}
