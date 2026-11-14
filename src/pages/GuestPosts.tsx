import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useSignedUrls } from '../lib/media';
import { FeedSkeleton } from '../components/fx/Skeleton';
import BlurImg from '../components/fx/BlurImg';
import './GuestPosts.css';

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

function timeAgo(value: string) {
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前';
  if (seconds < 86400 * 30) return Math.floor(seconds / 86400) + ' 天前';
  return new Date(value).toLocaleDateString();
}

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
        <button type="button" onClick={onLoginRequired}>♡ <span>{Number(post.like_count) || 0}</span></button>
        <button type="button" onClick={onLoginRequired}>评论 <span>{Number(post.comment_count) || 0}</span></button>
        <span className="guest-post-login-hint">登录后可互动</span>
      </div>
    </motion.article>
  );
}

export default function GuestPosts({ section, onLoginRequired }: Props) {
  const [posts, setPosts] = useState<GuestPost[]>([]);
  const [loading, setLoading] = useState(true);
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
        <header className="guest-posts-heading">
          <div style={{ color: '#8a93a1', fontSize: 10, letterSpacing: 2 }}>PUBLIC COMMUNITY</div>
          <h1>{title}</h1>
          <p>
            可以自由浏览，点赞、评论和发布需要登录。
          </p>
        </header>
      )}
      {section === 'all' && (
        <header className="guest-posts-heading">
          <h2>最新动态</h2>
          <p>所有公开动态与日常，按发布时间排列</p>
        </header>
      )}

      {loading && <FeedSkeleton count={2} />}
      {!loading && error && (
        <div role="alert" className="guest-post-state guest-post-error">
          <p style={{ margin: '0 0 12px' }}>{error}</p>
          <button type="button" className="guest-retry-button" onClick={() => setReloadKey(value => value + 1)}>重新加载</button>
        </div>
      )}
      {!loading && !error && posts.length === 0 && (
        <div className="guest-post-state guest-post-empty">
          暂时还没有公开内容。
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
