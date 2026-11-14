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

type GameProfile = { game_name: string; rank: string | null; status: string };
type ModerationRestriction = {
  action_type: 'community_mute' | 'chat_mute' | 'interaction_suspend';
  reason: string;
  created_at: string;
  expires_at: string | null;
};
type AccountStatus = {
  joined: boolean | null;
  banned_until: string | null;
  restrictions: ModerationRestriction[];
};

function formatStatusExpiry(value: string | null) {
  if (!value) return '期限：长期，直到管理员解除';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `期限：${date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })}`;
}

const restrictionCopy: Record<ModerationRestriction['action_type'], { title: string; detail: string }> = {
  community_mute: {
    title: '社区发布与互动已禁用',
    detail: '暂时无法发布动态、评论或点赞。',
  },
  chat_mute: {
    title: '私聊功能已禁用',
    detail: '暂时无法发送私聊消息。',
  },
  interaction_suspend: {
    title: '全站互动功能已受限',
    detail: '动态、评论、私聊等互动功能暂不可用。',
  },
};
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
  const [profileTitle, setProfileTitle] = useState<string | null>(null);
  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [stats, setStats] = useState({ posts: 0, comments: 0, photos: 0, likes: 0, loading: true });
  const [fbOpen, setFbOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const avUrl = useSignedUrl('avatars', avatar);
  const activeRestrictions = accountStatus?.restrictions ?? [];
  const accountCondition = accountStatus?.banned_until
    ? 'banned'
    : accountStatus?.joined === false
      ? 'disabled'
      : activeRestrictions.length > 0
        ? 'restricted'
        : 'normal';

  useEffect(() => {
    let alive = true;
    (async () => {
      const [profileResult, gameResult, accountResult] = await Promise.all([
        supabase.from('profiles')
          .select('display_name, username, avatar_path, profile_title')
          .eq('id', me).maybeSingle(),
        supabase.from('game_profiles')
          .select('game_name, rank, status')
          .eq('profile_id', me).maybeSingle(),
        (supabase as any).rpc('my_account_status'),
      ]);
      if (!alive) return;

      // If the profile-title migration has not reached this environment yet,
      // keep the core identity fields visible instead of failing the whole card.
      let profileData = profileResult.data as any;
      if (profileResult.error) {
        const fallback = await supabase.from('profiles')
          .select('display_name, username, avatar_path')
          .eq('id', me).maybeSingle();
        if (!alive) return;
        profileData = fallback.data as any;
      }
      if (profileData) {
        setName(profileData.display_name || profileData.username || '');
        setUsername(profileData.username || '');
        setAvatar(profileData.avatar_path ?? null);
        setProfileTitle(profileData.profile_title ?? null);
      }
      if (!gameResult.error && gameResult.data) {
        setGameProfile(gameResult.data as GameProfile);
      }
      if (!accountResult.error && accountResult.data) {
        const status = accountResult.data as Partial<AccountStatus>;
        setAccountStatus({
          joined: typeof status.joined === 'boolean' ? status.joined : null,
          banned_until: typeof status.banned_until === 'string' ? status.banned_until : null,
          restrictions: Array.isArray(status.restrictions) ? status.restrictions as ModerationRestriction[] : [],
        });
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
            <div className="me-hub-identity-heading">
              <strong>{name || '我的账号'}</strong>
              <div className="me-hub-identity-badges">
                {profileTitle && (
                  <span className="me-hub-title-chip"><span aria-hidden="true">✦</span>{profileTitle}</span>
                )}
                {gameProfile?.status === 'approved' && (
                  <span className="me-hub-game-chip">
                    <b>游戏称号</b>
                    {gameProfile.game_name}{gameProfile.rank ? ` · ${gameProfile.rank}` : ''}
                  </span>
                )}
                {gameProfile?.status === 'pending' && (
                  <span className="me-hub-game-chip is-pending">游戏资料审核中</span>
                )}
                {gameProfile?.status === 'rejected' && (
                  <span className="me-hub-game-chip is-rejected">游戏资料未通过</span>
                )}
                {accountStatus && (
                  <span className={`me-hub-account-pill is-${accountCondition}`}>
                    {accountCondition === 'banned'
                      ? '账号已封禁'
                      : accountCondition === 'disabled'
                        ? '成员权限已停用'
                        : accountCondition === 'restricted'
                          ? '账号功能受限'
                          : '账号正常'}
                  </span>
                )}
              </div>
            </div>
            <span>{username ? '@' + username : '班级成员'}</span>
            <small>管理你的资料、内容与账号设置</small>
          </div>
        </div>
        {accountStatus && (accountStatus.banned_until || accountStatus.joined === false || activeRestrictions.length > 0) && (
          <div className="me-hub-status-stack" role="status" aria-label="账号限制与处理状态">
            {accountStatus.banned_until && (
              <div className="me-hub-status-alert is-banned">
                <span className="me-hub-status-icon" aria-hidden="true">!</span>
                <div>
                  <strong>账号已被封禁</strong>
                  <p>当前账号的登录访问受到限制。{formatStatusExpiry(accountStatus.banned_until)}</p>
                </div>
              </div>
            )}
            {accountStatus.joined === false && !accountStatus.banned_until && (
              <div className="me-hub-status-alert is-disabled">
                <span className="me-hub-status-icon" aria-hidden="true">!</span>
                <div>
                  <strong>成员权限已停用</strong>
                  <p>当前账号尚未启用成员权限，暂时无法使用成员功能，请联系管理员核实。</p>
                </div>
              </div>
            )}
            {activeRestrictions.map((restriction) => {
              const copy = restrictionCopy[restriction.action_type];
              if (!copy) return null;
              return (
                <div className="me-hub-status-alert is-restricted" key={restriction.action_type + restriction.created_at}>
                  <span className="me-hub-status-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>{copy.title}</strong>
                    <p>{copy.detail}</p>
                    <p>处理原因：{restriction.reason}</p>
                    <small>{formatStatusExpiry(restriction.expires_at)}</small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
