import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';
import './MeHub.css';
import './MeHub.polish.css';
import FeedbackModal from '../components/FeedbackModal';
import SponsorModal from '../components/SponsorModal';
import NumberTicker from '../components/fx/NumberTicker';
import { useQuietHoursActive } from '../lib/userPreferences';

type Entry = { mark: string; title: string; note: string; to: string; badge?: string; act?: 'feedback' | 'sponsor' };
const groups: { title: string; note: string; entries: Entry[] }[] = [
  { title: '个人资料', note: '让其他人更了解你', entries: [
    { mark: '名片', title: '我的主页', note: '查看其他人可见的个人主页', to: 'profile' },
    { mark: '编辑', title: '编辑资料', note: '修改昵称、签名与兴趣爱好', to: 'edit' },
    { mark: '主题', title: '主页装扮', note: '调整背景、主题与页面布局', to: 'look' },
  ]},
  { title: '我的内容', note: '管理你发布、收藏和分享的内容', entries: [
    { mark: '动态', title: '我的动态', note: '查看和管理已发布的动态', to: '/me/posts' },
    { mark: '投稿', title: '我的表白投稿', note: '查看投稿状态或删除自己的投稿', to: '/love-wall?mine=1' },
  ]},
  { title: '内容与活动', note: '整理照片、活动和参与记录', entries: [
    { mark: '相册', title: '我的相册', note: '按分类浏览照片与影像', to: '/albums' },
    { mark: '活动', title: '活动', note: '查看近期活动与安排', to: '/events' },
    { mark: '日历', title: '内容日历', note: '按日期回看活动、动态和公告', to: '/calendar' },
    { mark: '特效', title: '热门特效', note: '探索有趣的互动效果', to: '/hot' },
  ]},
  { title: '消息互动', note: '查看收到的留言与站内通知', entries: [
    { mark: '留言', title: '我的留言', note: '查看收到的留言', to: '/me/greetings' },
  ]},
  { title: '账号与支持', note: '管理账号安全、隐私和网站服务', entries: [
    { mark: '隐私', title: '隐私设置', note: '管理资料可见范围与匿名偏好', to: 'privacy' },
    { mark: '安全', title: '账号安全', note: '管理密码与登录状态', to: '/me/account' },
    { mark: '反馈', title: '联系开发者与反馈', note: '提交问题或功能建议', to: '', act: 'feedback' },
    { mark: '进度', title: '我的反馈', note: '查看处理进度和管理员回复', to: '/me/feedback' },
    { mark: '支持', title: '赞助网站', note: '自愿支持网站长期维护', to: '', act: 'sponsor' },
  ]},
];

export default function MeHub() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const quietHoursActive = useQuietHoursActive(me);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
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
        setUsername((data as any).username || '');
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
    })().catch(() => {
      if (alive) setStats(current => ({ ...current, loading: false }));
    });
    return () => { alive = false; };
  }, [me]);

  function go(entry: Entry) {
    if (entry.act === 'feedback') { setFbOpen(true); return; }
    if (entry.act === 'sponsor') { setSponsorOpen(true); return; }
    if (entry.to === 'profile') nav('/members/' + me);
    else if (entry.to === 'edit') nav('/me/edit?sec=base');
    else if (entry.to === 'look') nav('/me/edit?sec=look');
    else if (entry.to === 'privacy') nav('/me/edit?sec=priv');
    else nav(entry.to);
  }

  return (
    <main className="page me-hub">
      <section className="me-hub-hero">
        <div className="me-hub-topbar">
          <div>
            <h1>个人中心</h1>
          </div>
        </div>

        <div className="me-hub-profile">
          <button className="me-hub-avatar" onClick={() => nav('/members/' + me)} aria-label="打开我的个人主页">
            {avUrl ? <img src={avUrl} alt="个人头像" /> : <span>{(name || '我').slice(0, 1)}</span>}
          </button>
          <div className="me-hub-identity">
            <strong>{name || '我的账号'}</strong>
            <span>{username ? '@' + username : '班级成员'}</span>
            <small>管理你的资料、内容与账号设置</small>
          </div>
        </div>
      </section>

      <section className="me-hub-stats" aria-label="我的社区数据">
        <div className="me-hub-stat-grid">
          <button onClick={() => nav('/me/posts')}>
            <strong>{stats.loading ? <span className="fx-skel-wrap" style={{ display: 'inline-block', width: 26, height: 20, verticalAlign: 'middle' }}><span className="fx-skel" style={{ display: 'block', width: '100%', height: '100%' }} /></span> : <NumberTicker value={stats.posts} />}</strong><span>我的动态</span>
          </button>
          <button onClick={() => nav('/me/content')}>
            <strong>{stats.loading ? <span className="fx-skel-wrap" style={{ display: 'inline-block', width: 26, height: 20, verticalAlign: 'middle' }}><span className="fx-skel" style={{ display: 'block', width: '100%', height: '100%' }} /></span> : <NumberTicker value={stats.comments} />}</strong><span>我的评论</span>
          </button>
          <button onClick={() => nav('/me/content')}>
            <strong>{stats.loading ? <span className="fx-skel-wrap" style={{ display: 'inline-block', width: 26, height: 20, verticalAlign: 'middle' }}><span className="fx-skel" style={{ display: 'block', width: '100%', height: '100%' }} /></span> : <NumberTicker value={stats.likes} />}</strong><span>收到点赞</span>
          </button>
        </div>
        <div className="me-hub-photo-note">已分享 <b>{stats.loading ? <span className="fx-skel-wrap" style={{ display: 'inline-block', width: 20, height: 14, verticalAlign: 'middle' }}><span className="fx-skel" style={{ display: 'block', width: '100%', height: '100%' }} /></span> : <NumberTicker value={stats.photos} />}</b> 张照片 <span>·</span> <button onClick={() => nav('/albums')}>去相册看看 ›</button></div>
      </section>


      <div className="me-hub-groups">
        {groups.map(group => (
          <section className="me-hub-group" key={group.title}>
            <header className="me-hub-group-head">
              <div><h2>{group.title}</h2><p>{group.note}</p></div>
            </header>
            <div className="me-hub-grid">
              {group.entries.map(entry => (
                <button className="me-hub-tile" key={entry.title} onClick={() => go(entry)}>
                  <span className="me-hub-mark">{entry.mark}</span>
                  <span className="me-hub-tile-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.note}</small>
                  </span>
                  {entry.badge === 'unread' && unread > 0 && !quietHoursActive
                    ? <span className="me-hub-unread"><span className="me-hub-dot" />{unread} 条未读</span>
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
