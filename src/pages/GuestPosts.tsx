import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useSignedUrls } from '../lib/media';
import { timeAgo } from '../lib/time';
import { FeedSkeleton, useDelayedLoading } from '../components/fx/Skeleton';
import BlurImg from '../components/fx/BlurImg';
import './GuestPosts.css';
import './Guest.cruip.css';

type GuestPost = {
  id: number;
  author_name: string;
  content: string;
  image_url: string | null;
  created_at: string;
  section: 'feed' | 'daily';
  like_count: number | string;
  comment_count: number | string;
};

type Props = {
  section: 'all' | 'feed' | 'daily';
  onLoginRequired: () => void;
};

const PAGE_SIZE = 20;


function GuestPostCard({ post, imageUrl, onLoginRequired, index }: {
  post: GuestPost;
  imageUrl?: string;
  onLoginRequired: () => void;
  index: number;
}) {
  const reduce = useReducedMotion();
  const name = post.author_name || '用户';
  return (
    <motion.article
      className="guest-post-card"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index % 8 * 0.025, 0.16) }}
    >
      <div className="guest-post-author">
        <div className="guest-post-avatar">{name.slice(0, 1)}</div>
        <div className="guest-post-author-copy">
          <strong>{name}</strong>
          <span>{post.section === 'daily' ? '日常' : '动态'} · {timeAgo(post.created_at)}</span>
        </div>
        <span className="guest-post-visibility">公开</span>
      </div>

      <p className="guest-post-content">{post.content}</p>

      {post.image_url && (
        imageUrl
          ? <BlurImg className="guest-post-image" src={imageUrl} alt="动态配图" />
          : <div className="fx-skel-wrap" role="status" aria-label="图片加载中"><div className="fx-skel" style={{ width: '100%', height: 180 }} /></div>
      )}

      <div className="guest-post-actions">
        <button type="button" className="guest-post-login-cta" onClick={onLoginRequired}
          aria-label={`登录后点赞，当前有 ${Number(post.like_count) || 0} 个赞`}>
          <span className="guest-post-login-cta__heart" aria-hidden="true">♡</span>
          <span>{Number(post.like_count) || 0}</span>
          <span className="guest-post-login-cta__label">登录后点赞</span>
        </button>
        <button type="button" onClick={onLoginRequired}>评论 <span>{Number(post.comment_count) || 0}</span></button>
      </div>
    </motion.article>
  );
}

export default function GuestPosts({ section, onLoginRequired }: Props) {
  const [posts, setPosts] = useState<GuestPost[]>([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedLoading(loading);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const imageUrls = useSignedUrls('media', posts.map(post => post.image_url));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setPosts([]);
    setHasMore(false);
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('guest_public_posts' as any, {
          p_section: section,
          p_limit: PAGE_SIZE,
          p_offset: 0,
        });
        if (!alive) return;
        if (rpcError) {
          setError('公开动态暂时无法加载，请稍后重试。');
          setPosts([]);
          return;
        }
        const rows = (Array.isArray(data) ? data : []) as GuestPost[];
        setPosts(rows);
        setHasMore(rows.length === PAGE_SIZE);
      } catch {
        if (alive) setError('公开动态暂时无法加载，请稍后重试。');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [section, reloadKey]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { data, error: rpcError } = await supabase.rpc('guest_public_posts' as any, {
      p_section: section,
      p_limit: PAGE_SIZE,
      p_offset: posts.length,
    });
    setLoadingMore(false);
    if (rpcError) {
      setError('加载更多内容失败，请重试。');
      return;
    }
    const rows = (Array.isArray(data) ? data : []) as GuestPost[];
    setPosts(current => [...current, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
  }

  const title = section === 'daily' ? '日常' : section === 'feed' ? '动态' : '最新动态';
  return (
    <section className={`guest-posts${section === 'all' ? ' guest-posts-home' : ''}`}>
      {section !== 'all' && (
        <header className="guest-posts-heading guest-cruip-section-head">
          <span className="guest-eyebrow">PUBLIC COMMUNITY</span>
          <h1>{title}</h1>
          <p>
            可以自由浏览，点赞、评论和发布需要登录。
          </p>
        </header>
      )}
      {section === 'all' && (
        <header className="guest-posts-heading guest-cruip-section-head">
          <span className="guest-eyebrow">LATEST POSTS</span>
          <h2>最新动态</h2>
          <p>所有公开动态与日常，按发布时间排列</p>
        </header>
      )}

      {showSkeleton && <FeedSkeleton count={2} />}
      {!loading && error && (
        <div role="alert" className="guest-post-state guest-post-error">
          <p style={{ margin: '0 0 12px' }}>{error}</p>
          <button type="button" className="guest-retry-button" onClick={() => setReloadKey(value => value + 1)}>重新加载</button>
        </div>
      )}
      {!loading && !error && posts.length === 0 && (
        <div className="guest-post-state guest-post-empty">
          <div className="guest-post-empty__art" aria-hidden="true">
            <svg viewBox="0 0 136 96" role="presentation">
              <ellipse cx="68" cy="83" rx="39" ry="5" fill="#edf1f4" />
              <rect x="34" y="20" width="68" height="53" rx="13" fill="#fff" stroke="#dfe5ea" strokeWidth="1.5" />
              <path d="M48 38h39M48 47h28" fill="none" stroke="#c8d2dc" strokeWidth="3" strokeLinecap="round" />
              <path d="M48 59h15" fill="none" stroke="#c8d2dc" strokeWidth="3" strokeLinecap="round" />
              <path d="m82 56 5 5 11-13" fill="none" stroke="#b0404f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m22 26 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#d9e4ec" />
              <circle cx="111" cy="35" r="4" fill="#e8edf1" />
            </svg>
          </div>
          <div className="guest-post-empty__copy">
            <h3>{section === 'daily' ? '这里还没有日常' : '这里还没有动态'}</h3>
            <p>{section === 'daily'
              ? '记录今天的小事，给生活留下一点痕迹。'
              : '先看看大家分享的内容，也可以登录后发布第一条动态。'}</p>
            <button type="button" className="guest-post-empty__button" onClick={onLoginRequired}>
              {section === 'daily' ? '登录后记录第一条日常' : '登录后发布第一条动态'}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}

      <div className="guest-post-list">
        {posts.map((post, index) => (
          <GuestPostCard
            key={post.id}
            post={post}
            imageUrl={post.image_url ? imageUrls[post.image_url] : undefined}
            onLoginRequired={onLoginRequired}
            index={index}
          />
        ))}
      </div>

      {!loading && !error && hasMore && (
        <button type="button" className="guest-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? '正在加载…' : '加载更多动态'}</button>
      )}
    </section>
  );
}
