import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';
import './MeHub.css';

type Entry = { mark: string; title: string; note: string; to: string; badge?: string };
const groups: { title: string; note: string; entries: Entry[] }[] = [
  { title: '个人主页', note: '整理你的个人形象', entries: [
    { mark: '主页', title: '我的主页', note: '别人看到的你的样子', to: 'profile' },
    { mark: '资料', title: '编辑资料', note: '名字、签名与爱好', to: 'edit' },
    { mark: '装扮', title: '主页装修', note: '背景、主题与排版', to: 'look' },
  ]},
  { title: '我的内容', note: '回看你在青春档案留下的记录', entries: [
    { mark: '动态', title: '我的动态', note: '发布过的所有动态', to: '/me/posts' },
    { mark: '收藏', title: '我的收藏', note: '保存起来的内容', to: '/me/favorites' },
    { mark: '相册', title: '我的相册', note: '照片与影像记录', to: '/feed' },
  ]},
  { title: '互动消息', note: '查看来自同学的互动', entries: [
    { mark: '留言', title: '我的留言', note: '收到的留言', to: '/me/greetings' },
    { mark: '通知', title: '我的通知', note: '消息与系统提醒', to: '/me/notifications', badge: 'unread' },
  ]},
  { title: '账号设置', note: '管理隐私与账号安全', entries: [
    { mark: '隐私', title: '隐私设置', note: '谁可以看到你的资料', to: 'privacy' },
    { mark: '安全', title: '账号安全', note: '密码与登录状态', to: '/me/account' },
  ]},
];

export default function MeHub() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const avUrl = useSignedUrl('avatars', avatar);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('profiles').select('display_name, username, avatar_path').eq('id', me).maybeSingle();
      if (!alive) return;
      if (data) {
        setName((data as any).display_name || (data as any).username || '');
        setAvatar((data as any).avatar_path ?? null);
      }
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('profile_id', me).eq('is_read', false);
      if (alive) setUnread(count ?? 0);
    })();
    return () => { alive = false; };
  }, [me]);

  function go(entry: Entry) {
    if (entry.to === 'profile') nav(`/members/${me}`);
    else if (entry.to === 'edit') nav('/me/edit?sec=base');
    else if (entry.to === 'look') nav('/me/edit?sec=look');
    else if (entry.to === 'privacy') nav('/me/edit?sec=priv');
    else nav(entry.to);
  }

  return (
    <main className="page me-hub">
      <section className="me-hub-hero">
        <div className="me-hub-hero-copy">
          <div className="me-hub-eyebrow">MY SPACE · 青春档案</div>
          <h1>我的空间</h1>
          <p>管理资料、内容与个人设置</p>
        </div>
        <div className="me-hub-profile">
          <div className="me-hub-avatar">
            {avUrl ? <img src={avUrl} alt="个人头像" /> : <span>{(name || '我').slice(0, 1)}</span>}
          </div>
          <div className="me-hub-identity">
            <strong>{name || '我的账号'}</strong>
            <span>个人中心</span>
          </div>
          {unread > 0 && <button className="me-hub-unread" onClick={() => nav('/me/notifications')}>{unread} 条未读</button>}
        </div>
      </section>

      <div className="me-hub-groups">
        {groups.map(group => (
          <section className="me-hub-group" key={group.title}>
            <header className="me-hub-group-head">
              <div><h2>{group.title}</h2><p>{group.note}</p></div>
              <span>{String(group.entries.length).padStart(2, '0')}</span>
            </header>
            <div className="me-hub-grid">
              {group.entries.map(entry => (
                <button className="me-hub-tile" key={entry.title} onClick={() => go(entry)}>
                  <span className="me-hub-mark">{entry.mark}</span>
                  <span className="me-hub-tile-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.note}</small>
                  </span>
                  {entry.badge === 'unread' && unread > 0
                    ? <span className="me-hub-dot" aria-label={`${unread} 条未读`} />
                    : <span className="me-hub-arrow">›</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
