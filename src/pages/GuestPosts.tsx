import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useSignedUrls } from '../lib/media';

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
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index % 8 * 0.025, 0.16) }}
      style={{
        padding: 17, borderRadius: 19, border: '1px solid #e9edf2',
        background: '#fff', boxShadow: '0 8px 26px rgba(25,35,52,.045)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div aria-hidden="true" style={{
          width: 40, height: 40, borderRadius: 15, display: 'grid', placeItems: 'center',
          flexShrink: 0, background: '#f0f3f7', color: '#4d5969', fontSize: 16, fontWeight: 750,
        }}>{name.slice(0, 1)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#202632', fontSize: 13.5, fontWeight: 750 }}>{name}</div>
          <div style={{ color: '#929aa6', fontSize: 11, marginTop: 3 }}>
            {post.section === 'daily' ? '日常' : '动态'} · {timeAgo(post.created_at)}
          </div>
        </div>
        <span style={{
          padding: '4px 8px', borderRadius: 999, background: '#f5f7fa',
          color: '#778191', fontSize: 10.5,
        }}>公开内容</span>
      </div>

      <p style={{
        margin: '13px 0 0', color: '#303846', fontSize: 14, lineHeight: 1.85,
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }}>{post.content}</p>

      {post.image_url && (
        imageUrl
          ? <img src={imageUrl} alt="动态配图" loading="lazy" decoding="async" style={{
              display: 'block', width: '100%', maxHeight: 480, objectFit: 'cover',
              borderRadius: 14, marginTop: 12, background: '#f3f5f8',
            }} />
          : <div role="status" style={{
              width: '100%', height: 150, borderRadius: 14, marginTop: 12,
              background: '#f6f7f9', display: 'grid', placeItems: 'center',
              color: '#9aa2ae', fontSize: 12,
            }}>图片加载中…</div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, marginTop: 13,
        paddingTop: 11, borderTop: '1px solid #f0f2f5',
      }}>
        <button type="button" onClick={onLoginRequired} style={{
          border: 0, background: 'transparent', color: '#697386', padding: 0,
          font: 'inherit', fontSize: 12.5, cursor: 'pointer',
        }}>♡ {Number(post.like_count) || 0} 点赞</button>
        <button type="button" onClick={onLoginRequired} style={{
          border: 0, background: 'transparent', color: '#697386', padding: 0,
          font: 'inherit', fontSize: 12.5, cursor: 'pointer',
        }}>评论 {Number(post.comment_count) || 0}</button>
        <span style={{ marginLeft: 'auto', color: '#a0a7b1', fontSize: 11 }}>登录后可互动</span>
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
    supabase.rpc('guest_public_posts' as any, {
      p_section: section,
      p_limit: PAGE_SIZE,
      p_offset: 0,
    }).then(({ data, error: rpcError }) => {
      if (!alive) return;
      if (rpcError) {
        setError('公开动态暂时无法加载，请稍后重试。');
        setPosts([]);
        return;
      }
      const rows = (Array.isArray(data) ? data : []) as GuestPost[];
      setPosts(rows);
      setHasMore(rows.length === PAGE_SIZE);
    }).catch(() => {
      if (alive) setError('公开动态暂时无法加载，请稍后重试。');
    }).finally(() => {
      if (alive) setLoading(false);
    });
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
    <section style={{ marginTop: 18 }}>
      {section !== 'all' && (
        <header style={{ padding: '4px 2px 12px' }}>
          <div style={{ color: '#8a93a1', fontSize: 10, letterSpacing: 2 }}>PUBLIC COMMUNITY</div>
          <h1 style={{ margin: '6px 0 0', color: '#202632', fontSize: 25 }}>{title}</h1>
          <p style={{ margin: '5px 0 0', color: '#7b8492', fontSize: 12.5, lineHeight: 1.6 }}>
            可以自由浏览，点赞、评论和发布需要登录。
          </p>
        </header>
      )}
      {section === 'all' && (
        <header style={{ padding: '4px 2px 12px' }}>
          <h2 style={{ margin: 0, color: '#202632', fontSize: 19 }}>最新动态</h2>
          <p style={{ margin: '5px 0 0', color: '#929aa6', fontSize: 11.5 }}>所有公开动态与日常，按发布时间排列</p>
        </header>
      )}

      {loading && <div role="status" style={{ padding: 24, textAlign: 'center', color: '#929aa6', fontSize: 13 }}>正在加载公开内容…</div>}
      {!loading && error && (
        <div role="alert" style={{ padding: 20, borderRadius: 16, border: '1px solid #e9edf2', background: '#fff', color: '#697386', textAlign: 'center', fontSize: 13 }}>
          <p style={{ margin: '0 0 12px' }}>{error}</p>
          <button type="button" onClick={() => setReloadKey(value => value + 1)} style={{
            border: '1px solid #dfe4eb', background: '#fff', color: '#303846',
            borderRadius: 999, padding: '8px 14px', cursor: 'pointer',
          }}>重新加载</button>
        </div>
      )}
      {!loading && !error && posts.length === 0 && (
        <div style={{ padding: 24, borderRadius: 16, border: '1px dashed #dfe4eb', color: '#8a93a1', background: '#fff', textAlign: 'center', fontSize: 13 }}>
          暂时还没有公开内容。
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
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
        <button type="button" disabled={loadingMore} onClick={() => void loadMore()} style={{
          display: 'block', width: '100%', marginTop: 14, border: '1px solid #e5e9ef',
          borderRadius: 999, padding: '12px 16px', background: '#fff',
          color: '#566173', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>{loadingMore ? '正在加载…' : '加载更多动态'}</button>
      )}
    </section>
  );
}
