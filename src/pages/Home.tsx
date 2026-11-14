import { BRAND_NAME, BRAND_SUBTITLE, resolveBrandTitle, resolveBrandSubtitle } from '../lib/brand';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/time';
import VisitCounter from '../components/VisitCounter';
import Marquee from '../components/fx/Marquee';
import { InlineLoading, useDelayedLoading } from '../components/fx/Skeleton';
import { isInApp } from '../lib/installedApp';
import './Home.vibe.css';

/**
 * Home as an announcement-first mixed wall: board notices pinned on top,
 * love-wall confessions and feed posts merged below by time.
 * Read-only preview only: likes/comments/composing stay on /love-wall and /feed.
 * Data access reuses the existing queries; presentation only.
 */

type LovePost = {
  id: string;
  recipient_name: string | null;
  category: string;
  content: string;
  is_anonymous: boolean;
  author_display_name: string | null;
  status: string;
  created_at: string;
};

type FeedPost = {
  id: number;
  author_id: string;
  content: string;
  created_at: string;
};

type WallItem =
  | { kind: 'love'; id: string; created_at: string; love: LovePost }
  | { kind: 'feed'; id: number; created_at: string; feed: FeedPost };

const CAT_COLOR: Record<string, { bg: string; fg: string }> = {
  '暗恋心事': { bg: '#fdeef3', fg: '#c2437b' },
  '认真表白': { bg: '#fdecec', fg: '#c22f3d' },
  '感谢与祝福': { bg: '#fdf6e0', fg: '#9a7408' },
  '毕业寄语': { bg: '#eceffd', fg: '#4c5ec2' },
};

const FILTERS = [
  ['all', '全部'],
  ['love', '表白墙'],
  ['feed', '动态'],
] as const;

type Filter = (typeof FILTERS)[number][0];

const PAGE_SIZE = 10;

export default function Home() {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const [title, setTitle] = useState(BRAND_NAME);
  const [subtitle, setSubtitle] = useState(BRAND_SUBTITLE);
  const [notices, setNotices] = useState<any[]>([]);
  const [lovePosts, setLovePosts] = useState<LovePost[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [annPop, setAnnPop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const showWallLoading = useDelayedLoading(loading);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [loveVisible, setLoveVisible] = useState(PAGE_SIZE);
  const [feedVisible, setFeedVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const { data: ss, error: settingsError } = await supabase.from('site_settings').select('key, value');
        if (!live) return;
        (ss ?? []).forEach((x: any) => {
          if (x.key === 'site_title') setTitle(resolveBrandTitle(x.value));
          if (x.key === 'site_subtitle') setSubtitle(resolveBrandSubtitle(x.value));
        });
        const nowIso = new Date().toISOString();
        const [n, l, p] = await Promise.all([
          supabase.from('board_messages').select('id, title, content, created_at')
            .eq('is_admin_msg', true).is('deleted_at', null)
            .in('audience', isInApp() ? ['all', 'app'] : ['all'])
            .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
            .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3),
          supabase.rpc('love_wall_published'),
          supabase.from('posts').select('id, author_id, content, created_at').eq('section', 'feed').is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(100),
        ]);
        if (!live) return;
        setNotices(n.data ?? []);
        setLovePosts(((l.data ?? []) as LovePost[]).filter(x => x.status === 'published'));
        setFeedPosts((p.data ?? []) as FeedPost[]);
        setNames({});

        const hasQueryError = [settingsError, n.error, l.error, p.error].some(Boolean);
        if (hasQueryError) {
          setLoadError('部分首页内容暂时无法加载，请检查网络后重试。');
        }

        const ids = new Set<string>();
        ((p.data ?? []) as FeedPost[]).forEach((x: FeedPost) => ids.add(x.author_id));
        if (ids.size) {
          const { data: dir, error: directoryError } = await supabase.rpc('member_directory', { q: '', lim: 100, skip: 0 });
          if (!live) return;
          if (directoryError) {
            setLoadError('成员资料暂时无法加载，请稍后重试。');
          } else {
            const mp: Record<string, string> = {};
            ((dir ?? []) as any[]).forEach((x: any) => { mp[x.id] = x.display_name ?? x.username; });
            setNames(mp);
          }
        }
      } catch {
        if (live) setLoadError('首页内容加载失败，请检查网络后重试。');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [reloadKey]);

  const loveShown = lovePosts.slice(0, loveVisible);
  const feedShown = feedPosts.slice(0, feedVisible);
  const merged: WallItem[] = [...loveShown.map((love): WallItem => ({ kind: 'love', id: love.id, created_at: love.created_at, love })),
    ...feedShown.map((feed): WallItem => ({ kind: 'feed', id: feed.id, created_at: feed.created_at, feed }))]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const visibleItems: WallItem[] = filter === 'love'
    ? loveShown.map((love): WallItem => ({ kind: 'love', id: love.id, created_at: love.created_at, love }))
    : filter === 'feed'
      ? feedShown.map((feed): WallItem => ({ kind: 'feed', id: feed.id, created_at: feed.created_at, feed }))
      : merged;
  const hasMore = filter === 'love'
    ? lovePosts.length > loveVisible
    : filter === 'feed'
      ? feedPosts.length > feedVisible
      : lovePosts.length > loveVisible || feedPosts.length > feedVisible;
  const bothEmpty = !loading && lovePosts.length === 0 && feedPosts.length === 0;

  function loadMore() {
    if (filter === 'love') setLoveVisible(value => value + PAGE_SIZE);
    else if (filter === 'feed') setFeedVisible(value => value + PAGE_SIZE);
    else {
      setLoveVisible(value => value + PAGE_SIZE);
      setFeedVisible(value => value + PAGE_SIZE);
    }
  }

  return (
    <div className="page vibe-home">
      {loadError && (
        <div className="vh-load-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => setReloadKey(value => value + 1)} disabled={loading}>
            {loading ? '正在重试…' : '重新加载'}
          </button>
        </div>
      )}
      <header className="vh-intro">
        <div className="vh-brand-lockup">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>

      <button type="button" className="vh-search" aria-label="搜索全站内容"
        onClick={() => window.dispatchEvent(new CustomEvent('qznb:open-search'))}>
        <span className="vh-search-icon" aria-hidden="true">⌕</span>
        <span>搜索成员、动态、相册或公告</span>
      </button>

      {notices.length > 0 && (
        <div className="vh-ticker" aria-label="公告快讯">
          <span className="vh-ticker-label">公告</span>
          <Marquee pauseOnHover duration={36}>
            {notices.map(n => (
              <button type="button" className="vh-ticker-item" key={n.id} onClick={() => setAnnPop(n)}>
                <span className="vh-ticker-dot" aria-hidden="true">●</span>
                {n.title || '公告'}
              </button>
            ))}
          </Marquee>
        </div>
      )}

      <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.14 }}
        transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}>
        <div className="vh-section-head">
          <div><h2>公告</h2><p>需要留意的消息</p></div>
          <button className="vh-text-link" onClick={() => nav('/board')}>全部公告 ↗</button>
        </div>
        {notices.length > 0 ? (
          <div className="vh-notices">
            {notices.map((n, i) => (
              <button className={`vh-notice${i === 0 ? ' vh-notice-first' : ''}`} key={n.id} onClick={() => setAnnPop(n)}>
                <span className="vh-notice-tag">{i === 0 ? '最新公告' : '站内消息'}</span>
                <strong>{n.title || '公告'}</strong>
                <p>{(n.content || '').slice(0, 100)}</p>
                <time>{timeAgo(n.created_at)}</time>
              </button>
            ))}
          </div>
        ) : (
          !loading && <div className="vh-empty">暂无公告。</div>
        )}
      </motion.section>

      <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.14 }}
        transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}>
        <div className="vh-section-head">
          <div><h2>帖子墙</h2><p>表白与动态，按时间排在一起</p></div>
        </div>
        <div className="vh-wall-actions">
          <button type="button" className="vh-wall-compose-primary" onClick={() => nav('/love-wall')}>写表白</button>
          <button type="button" className="vh-wall-compose" onClick={() => nav('/feed')}>发动态</button>
        </div>
        <div className="vh-wall-filters" role="group" aria-label="筛选帖子">
          {FILTERS.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`vh-wall-filter${filter === key ? ' is-active' : ''}`}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (showWallLoading ? <div className="vh-load-state"><InlineLoading label="帖子加载中…" /></div> : null) : bothEmpty ? (
          <div className="vh-wall-empty">
            <p>还没有内容，去表白墙或动态发第一条吧。</p>
            <div className="vh-wall-actions vh-wall-empty-actions">
              <button type="button" className="vh-wall-compose-primary" onClick={() => nav('/love-wall')}>去表白墙</button>
              <button type="button" className="vh-wall-compose" onClick={() => nav('/feed')}>去动态</button>
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="vh-wall-empty">
            <p>{filter === 'love' ? '表白墙这里还没有内容。' : filter === 'feed' ? '动态这里还没有内容。' : '这里还没有内容。'}</p>
          </div>
        ) : (
          <div className="vh-wall-list">
            {visibleItems.map(item => item.kind === 'love' ? (
              <Link className="vh-wall-card" key={`love-${item.id}`} to="/love-wall" aria-label="去表白墙查看">
                <span className="vh-cat-tag" style={(() => { const c = CAT_COLOR[item.love.category] ?? { bg: '#f4f5f6', fg: '#606b79' }; return { backgroundColor: c.bg, color: c.fg }; })()}>
                  {item.love.category || '表白墙'}
                </span>
                <span className="vh-wall-to">TO · {item.love.recipient_name || 'TA'}</span>
                <p className="vh-wall-content">{item.love.content}</p>
                <span className="vh-wall-meta">
                  {item.love.is_anonymous ? '匿名同学' : item.love.author_display_name || '同学'} · {timeAgo(item.created_at)}
                </span>
              </Link>
            ) : (
              <Link className="vh-wall-card" key={`feed-${item.id}`} to="/feed" aria-label="去动态查看">
                <span className="vh-cat-tag vh-cat-feed">动态</span>
                <span className="vh-wall-to">{names[item.feed.author_id] || '成员'}</span>
                <p className="vh-wall-content">{item.feed.content || '分享了一条动态'}</p>
                <span className="vh-wall-meta">{timeAgo(item.created_at)}</span>
              </Link>
            ))}
          </div>
        )}

        {hasMore && (
          <div className="vh-wall-more">
            <button type="button" className="vh-wall-more-btn" onClick={loadMore}>加载更多</button>
          </div>
        )}
      </motion.section>

      {annPop && (
        <div className="vh-modal-backdrop" onClick={() => setAnnPop(null)}>
          <article className="vh-modal" onClick={e => e.stopPropagation()}>
            <button className="vh-modal-close" onClick={() => setAnnPop(null)}>关闭</button>
            <h3>{annPop.title || '公告'}</h3>
            <p>{annPop.content}</p>
            <time style={{ color: '#97a3af', fontSize: 11 }}>{timeAgo(annPop.created_at)}</time>
          </article>
        </div>
      )}
      <VisitCounter />
    </div>
  );
}
