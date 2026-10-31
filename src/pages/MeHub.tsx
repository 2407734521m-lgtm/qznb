import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';
import './MeHub.css';
import FeedbackModal from '../components/FeedbackModal';
import SponsorModal from '../components/SponsorModal';

type Entry = { mark: string; title: string; note: string; to: string; badge?: string; act?: 'feedback' | 'sponsor' };
const groups: { title: string; note: string; entries: Entry[] }[] = [
  { title: '个人主页', note: '整理你的个人形象', entries: [
    { mark: '主页', title: '我的主页', note: '别人看到的你的样子', to: 'profile' },
    { mark: '资料', title: '编辑资料', note: '名字、签名与爱好', to: 'edit' },
    { mark: '装扮', title: '主页装修', note: '背景、主题与排版', to: 'look' },
  ]},
  { title: '我的内容', note: '回看你在青春档案留下的记录', entries: [
    { mark: '动态', title: '我的动态', note: '发布过的所有动态', to: '/me/posts' },
    { mark: '收藏', title: '我的收藏', note: '保存起来的内容', to: '/me/favorites' },
    { mark: '相册', title: '班级相册', note: '按分类浏览照片与影像', to: '/albums' },
    { mark: '活动', title: '班级活动', note: '查看近期活动与安排', to: '/events' },
    { mark: '特效', title: '热门特效', note: '探索互动效果', to: '/hot' },
  ]},
  { title: '成长与荣誉', note: '记录你的社区参与和青春足迹', entries: [
    { mark: '成长', title: '成长档案', note: '活跃天数、贡献记录与纪念徽章', to: '/me/growth' },
  ]},
  { title: '互动消息', note: '查看来自同学的互动', entries: [
    { mark: '留言', title: '我的留言', note: '收到的留言', to: '/me/greetings' },
    { mark: '通知', title: '我的通知', note: '消息与系统提醒', to: '/me/notifications', badge: 'unread' },
  ]},
  { title: '账号设置', note: '管理隐私与账号安全', entries: [
    { mark: '隐私', title: '隐私设置', note: '谁可以看到你的资料', to: 'privacy' },
    { mark: '安全', title: '账号安全', note: '密码与登录状态', to: '/me/account' },
    { mark: '设置', title: '设置中心', note: '通知偏好、设备与动画', to: '/me/settings' },
  ]},
  { title: '支持', note: '遇到问题，或想支持一下网站', entries: [
    { mark: '反馈', title: '联系开发者与反馈', note: '提交问题或意见', to: '', act: 'feedback' },
    { mark: '进度', title: '我的反馈', note: '查看处理状态和管理员回复', to: '/me/feedback' },
    { mark: '赞助', title: '赞助', note: '自愿支持网站维护', to: '', act: 'sponsor' },
  ]},
];

export default function MeHub() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [stats, setStats] = useState({ posts: 0, comments: 0, photos: 0, likes: 0, loading: true });
  const [fbOpen, setFbOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
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
      const [{ count }, postRows, commentCount, photoCount] = await Promise.all([
        supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('profile_id', me).eq('is_read', false),
        supabase.from('posts').select('id').eq('author_id', me).is('deleted_at', null),
        supabase.from('comments').select('id', { count: 'exact', head: true }).eq('author_id', me).is('deleted_at', null),
        supabase.from('album_photos').select('id', { count: 'exact', head: true }).eq('uploaded_by', me),
      ]);
      const ownPostIds = (postRows.data ?? []).map((post: any) => post.id);
      let likes = 0;
      if (ownPostIds.length) {
        const { count: likeCount } = await supabase.from('post_likes').select('id', { count: 'exact', head: true }).in('post_id', ownPostIds);
        likes = likeCount ?? 0;
      }
      if (alive) {
        setUnread(count ?? 0);
        setStats({ posts: ownPostIds.length, comments: commentCount.count ?? 0, photos: photoCount.count ?? 0, likes, loading: false });
      }
    })();
    return () => { alive = false; };
  }, [me]);

  function go(entry: Entry) {
    if (entry.act === 'feedback') { setFbOpen(true); return; }
    if (entry.act === 'sponsor') { setSponsorOpen(true); return; }
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

      <section className="me-footprint" aria-label="我的社区足迹">
        <div className="me-footprint-head"><div><h2>我的足迹</h2><p>你为青春档案留下的记录</p></div><span>{stats.loading ? '统计中…' : '持续累积'}</span></div>
        <div className="me-footprint-grid">
          <div><strong>{stats.loading ? '—' : stats.posts}</strong><span>发布动态</span></div>
          <div><strong>{stats.loading ? '—' : stats.comments}</strong><span>参与评论</span></div>
          <div><strong>{stats.loading ? '—' : stats.photos}</strong><span>上传照片</span></div>
          <div><strong>{stats.loading ? '—' : stats.likes}</strong><span>收到点赞</span></div>
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
      {fbOpen && <FeedbackModal kind="general" onClose={() => setFbOpen(false)} />}
      {sponsorOpen && <SponsorModal onClose={() => setSponsorOpen(false)} />}
    </main>
  );
}
