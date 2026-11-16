import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl, useSignedUrls } from '../lib/media';
import './MeHub.css';
import './MeHub.polish.css';
import LargeTitleBar from '../components/LargeTitleBar';
import NumberTicker from '../components/fx/NumberTicker';
import BlurImg from '../components/fx/BlurImg';

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

/** 个人中心下方直接展示的“我发过的内容”，不用点进子页。 */
type FeedPostItem = {
  kind: 'post'; id: string; content: string; image_url: string | null; section: string;
  created_at: string; likes: number; comments: number;
};
type FeedLoveItem = {
  kind: 'love'; id: string; content: string; recipient_name: string | null; category: string;
  is_anonymous: boolean; status: string; created_at: string;
};
type FeedAnswerItem = {
  kind: 'answer'; id: string; question: string; answer: string; is_public: boolean; created_at: string;
};
type FeedItem = FeedPostItem | FeedLoveItem | FeedAnswerItem;
type FeedFilter = 'all' | 'post' | 'love' | 'answer';

function formatFeedTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

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
export default function MeHub() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [profileTitle, setProfileTitle] = useState<string | null>(null);
  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [stats, setStats] = useState({ posts: 0, comments: 0, photos: 0, likes: 0, loading: true });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [feedVisible, setFeedVisible] = useState(10);
  const feedImageUrls = useSignedUrls('media', feed.filter((item): item is FeedPostItem => item.kind === 'post').map(item => item.image_url));
  const avUrl = useSignedUrl('avatars', avatar);
  const activeRestrictions = accountStatus?.restrictions ?? [];
  const accountCondition = accountStatus?.banned_until
    ? 'banned'
    : activeRestrictions.length > 0
      ? 'restricted'
      : accountStatus?.joined === false
        ? 'not-member'
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
      const [postRows, commentCount, photoCount] = await Promise.all([
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
        setStats({ posts: ownPostIds.length, comments: commentCount.count ?? 0, photos: photoCount.count ?? 0, likes, loading: false });
      }
    })().catch(() => {
      if (alive) setStats(current => ({ ...current, loading: false }));
    });
    return () => { alive = false; };
  }, [me]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setFeedLoading(true);
      try {
        const [postResult, loveResult, inboxResult] = await Promise.all([
          supabase.from('posts')
            .select('id, content, image_url, created_at, section').eq('author_id', me)
            .is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
          supabase.from('love_wall_posts')
            .select('id,author_id,recipient_name,category,content,is_anonymous,status,created_at')
            .eq('author_id', me).order('created_at', { ascending: false }).limit(50),
          (supabase as any).rpc('my_anonymous_question_inbox'),
        ]);
        if (!alive) return;
        if (postResult.error || loveResult.error || inboxResult.error) {
          setFeedError('我的发布暂时无法加载，请稍后再试。');
          return;
        }
        const postRows = (postResult.data ?? []) as any[];
        const postIds = postRows.map(row => row.id);
        const likeMap = new Map<string, number>();
        const commentMap = new Map<string, number>();
        if (postIds.length) {
          const [likeRows, commentRows] = await Promise.all([
            supabase.from('post_likes').select('post_id').in('post_id', postIds),
            supabase.from('comments').select('post_id').is('deleted_at', null).in('post_id', postIds),
          ]);
          for (const row of (likeRows.data ?? []) as any[]) likeMap.set(row.post_id, (likeMap.get(row.post_id) ?? 0) + 1);
          for (const row of (commentRows.data ?? []) as any[]) commentMap.set(row.post_id, (commentMap.get(row.post_id) ?? 0) + 1);
        }
        if (!alive) return;
        const items: FeedItem[] = [
          ...postRows.map((row): FeedPostItem => ({
            kind: 'post', id: row.id, content: row.content ?? '', image_url: row.image_url ?? null,
            section: row.section ?? 'feed', created_at: row.created_at,
            likes: likeMap.get(row.id) ?? 0, comments: commentMap.get(row.id) ?? 0,
          })),
          ...((loveResult.data ?? []) as any[]).map((row): FeedLoveItem => ({
            kind: 'love', id: row.id, content: row.content ?? '', recipient_name: row.recipient_name ?? null,
            category: row.category ?? '', is_anonymous: !!row.is_anonymous, status: row.status ?? '', created_at: row.created_at,
          })),
          ...((inboxResult.data ?? []) as any[])
            .filter(row => row && typeof row.answer === 'string' && row.answer.trim().length > 0)
            .map((row): FeedAnswerItem => ({
              kind: 'answer', id: row.id, question: row.question ?? '', answer: row.answer,
              is_public: !!row.is_public, created_at: row.answered_at ?? row.created_at,
            })),
        ];
        items.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        setFeed(items);
      } catch {
        if (alive) setFeedError('我的发布暂时无法加载，请稍后再试。');
      } finally {
        if (alive) setFeedLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [me]);

  const feedCounts = {
    all: feed.length,
    post: feed.filter(item => item.kind === 'post').length,
    love: feed.filter(item => item.kind === 'love').length,
    answer: feed.filter(item => item.kind === 'answer').length,
  };
  const shownFeed = feed.filter(item => feedFilter === 'all' || item.kind === feedFilter).slice(0, feedVisible);

  function openFeedItem(item: FeedItem) {
    if (item.kind === 'post') nav(item.section === 'daily' ? '/daily' : '/feed', { state: { searchQuery: String(item.content || '').slice(0, 32) } });
    else if (item.kind === 'love') nav('/love-wall?mine=1');
    else nav('/questions');
  }

  return (
    <main className="page me-hub">
      {/*
        大标题收起：LargeTitleBar 必须直接挂在页面滚动流里——.me-hub-hero 有
        overflow:hidden，吸顶条放卡片里会被裁在卡片范围内、滚走后留不住。
        所以标题移到 hero 卡片上方（与首页/发现页同一 pattern）；副标题不另写，
        “管理你的资料、内容与账号设置”已在下方头像旁的身份区里。
      */}
      <LargeTitleBar title="个人中心" headerClassName="me-hub-large-title" />
      <section className="me-hub-hero">
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
                {accountStatus && accountCondition !== 'normal' && (
                  <span className={`me-hub-account-pill is-${accountCondition}`}>
                    {accountCondition === 'banned'
                      ? '账号已封禁'
                      : accountCondition === 'not-member'
                        ? '尚未加入成员'
                        : '账号功能受限'}
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
              <div className="me-hub-status-alert is-not-member">
                <span className="me-hub-status-icon" aria-hidden="true">i</span>
                <div>
                  <strong>当前账号尚未加入成员</strong>
                  <p>这表示成员资格尚未启用，不代表账号被封禁。部分成员功能可能无法使用。</p>
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

      <section className="me-hub-feed" aria-label="我的发布">
        <header className="me-hub-feed-head">
          <div><h2>我的发布</h2><p>不用点开，直接往下看</p></div>
          <span className="me-hub-feed-count">{feedCounts.all} 条</span>
        </header>
        <div className="me-hub-feed-filters" role="tablist" aria-label="发布类型">
          {([
            ['all', `全部 ${feedCounts.all}`],
            ['post', `动态 ${feedCounts.post}`],
            ['love', `表白 ${feedCounts.love}`],
            ['answer', `回答 ${feedCounts.answer}`],
          ] as [FeedFilter, string][]).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={feedFilter === key}
              className={feedFilter === key ? 'active' : ''} onClick={() => { setFeedFilter(key); setFeedVisible(10); }}>
              {label}
            </button>
          ))}
        </div>
        {feedError && <p className="me-hub-feed-note" role="status">{feedError}</p>}
        {feedLoading ? (
          <div className="me-hub-feed-note">正在加载我的发布…</div>
        ) : shownFeed.length === 0 ? (
          <div className="me-hub-feed-empty">还没有发布过{feedFilter === 'post' ? '动态' : feedFilter === 'love' ? '表白投稿' : feedFilter === 'answer' ? '匿名回答' : '内容'}</div>
        ) : (
          <div className="me-hub-feed-list">
            {shownFeed.map(item => (
              <article className="me-hub-feed-card" key={`${item.kind}-${item.id}`}
                role="button" tabIndex={0} onClick={() => openFeedItem(item)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFeedItem(item); } }}>
                {item.kind === 'post' && (
                  <>
                    <div className="me-hub-feed-meta">
                      <span className="me-hub-feed-tag is-post">{item.section === 'daily' ? '日常' : '动态'}</span>
                      <time>{formatFeedTime(item.created_at)}</time>
                    </div>
                    <p className="me-hub-feed-text">{item.content}</p>
                    {item.image_url && feedImageUrls[item.image_url] && (
                      <BlurImg src={feedImageUrls[item.image_url]} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 8 }} />
                    )}
                    <div className="me-hub-feed-foot"><span>♥ {item.likes}</span><span>💬 {item.comments}</span><span className="me-hub-feed-more">查看 ›</span></div>
                  </>
                )}
                {item.kind === 'love' && (
                  <>
                    <div className="me-hub-feed-meta">
                      <span className="me-hub-feed-tag is-love">表白</span>
                      <span>{item.is_anonymous ? '匿名投稿' : '署名投稿'}{item.recipient_name ? ` · 写给 ${item.recipient_name}` : ''}</span>
                      <time>{formatFeedTime(item.created_at)}</time>
                    </div>
                    <p className="me-hub-feed-text">{item.content}</p>
                    <div className="me-hub-feed-foot"><span>{item.status === 'published' ? '已公开展示' : item.status === 'pending' ? '审核通过后公开展示' : '未公开展示'}</span><span className="me-hub-feed-more">查看 ›</span></div>
                  </>
                )}
                {item.kind === 'answer' && (
                  <>
                    <div className="me-hub-feed-meta">
                      <span className="me-hub-feed-tag is-answer">匿名回答</span>
                      <span>{item.is_public ? '已公开' : '仅提问者可见'}</span>
                      <time>{formatFeedTime(item.created_at)}</time>
                    </div>
                    <p className="me-hub-feed-question">问：{item.question}</p>
                    <p className="me-hub-feed-text">答：{item.answer}</p>
                    <div className="me-hub-feed-foot"><span className="me-hub-feed-more">去提问箱 ›</span></div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
        {!feedLoading && !feedError && shownFeed.length > 0 && feed.filter(item => feedFilter === 'all' || item.kind === feedFilter).length > feedVisible && (
          <button type="button" className="me-hub-feed-more-btn" onClick={() => setFeedVisible(current => current + 10)}>加载更多</button>
        )}
      </section>

      <button type="button" className="me-hub-settings-btn" onClick={() => nav('/me/settings')}>
        <span>设置</span><span aria-hidden="true">›</span>
      </button>
    </main>
  );
}
