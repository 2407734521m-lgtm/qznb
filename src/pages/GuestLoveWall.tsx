import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSignedUrls } from '../lib/media';
import { timeAgo } from '../lib/time';
import { FeedSkeleton } from '../components/fx/Skeleton';

type GuestPost = {
  id: string;
  recipient_name: string | null;
  category: string;
  content: string;
  is_anonymous: boolean;
  created_at: string;
  comment_count: number | string;
};
type GuestMedia = {
  id: string;
  post_id: string;
  path: string;
  kind: 'image' | 'video';
  sort: number;
};


const categoryColors: Record<string, { background: string; color: string }> = {
  '暗恋心事': { background: '#fdeef3', color: '#c2437b' },
  '认真表白': { background: '#fdecec', color: '#c22f3d' },
  '感谢与祝福': { background: '#fdf6e0', color: '#9a7408' },
  '毕业寄语': { background: '#eceffd', color: '#4c5ec2' },
};

export default function GuestLoveWall({ onLoginRequired }: { onLoginRequired: () => void }) {
  const [posts, setPosts] = useState<GuestPost[]>([]);
  const [media, setMedia] = useState<Record<string, Array<GuestMedia & { url?: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const { data, error: rpcError } = await supabase.rpc('love_wall_guest_published' as any);
        if (rpcError) throw rpcError;
        const rows = (Array.isArray(data) ? data : []) as GuestPost[];
        if (!alive) return;
        setPosts(rows);

        const ids = rows.map(post => post.id);
        if (!ids.length) {
          setMedia({});
          return;
        }
        const { data: mediaRows, error: mediaError } = await supabase.rpc('love_wall_media_for_posts' as any, { p_post_ids: ids });
        if (mediaError || !mediaRows?.length) {
          setMedia({});
          return;
        }
        const listed = (mediaRows as Array<GuestMedia & { path: string | null }>)
          .filter((item): item is typeof item & { path: string } => typeof item.path === 'string' && item.path.length > 0);
        if (!listed.length) {
          setMedia({});
          return;
        }
        let signed: Record<string, string> = {};
        try {
          signed = await getSignedUrls('media', listed.map(item => item.path));
        } catch {
          // 附件签名失败时仍展示公开文字，不影响浏览。
        }
        if (!alive) return;
        const grouped: Record<string, Array<GuestMedia & { url?: string }>> = {};
        listed.forEach(item => {
          (grouped[item.post_id] = grouped[item.post_id] || []).push({ ...item, url: signed[item.path] });
        });
        setMedia(grouped);
      } catch {
        if (alive) setError('公开内容暂时无法加载，请稍后刷新重试。');
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, []);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '10px 0 110px', color: '#202124' }}>
      <header style={{ padding: '8px 2px 16px' }}>
        <div style={{ fontSize: 11, letterSpacing: 2.4, color: '#737b89' }}>PUBLIC · LITTLE FEELINGS</div>
        <h1 style={{ fontSize: 27, margin: '8px 0 4px' }}>表白墙</h1>
        <p style={{ color: '#606673', lineHeight: 1.7, fontSize: 13, margin: 0 }}>
          这里展示已经审核公开的心意。游客可以浏览，互动需要正式账号。
        </p>
      </header>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 14px', marginBottom: 14, borderRadius: 15,
        background: '#f4f7fb', border: '1px solid #e6ebf2',
      }}>
        <span style={{ color: '#586273', fontSize: 12 }}>只展示审核通过的公开投稿</span>
        <button type="button" onClick={onLoginRequired} style={{
          border: 0, borderRadius: 999, padding: '8px 13px',
          background: '#202632', color: '#fff', fontSize: 12, fontWeight: 800,
        }}>登录后参与</button>
      </div>

      {loading && <FeedSkeleton count={2} />}
      {!loading && error && (
        <div role="status" style={{ padding: 22, borderRadius: 16, background: '#fff', border: '1px solid #e9ebf0', color: '#697386', textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px' }}>{error}</p>
          <button type="button" onClick={() => window.location.reload()} style={{
            padding: '8px 14px', borderRadius: 999, border: '1px solid #dfe3ea', background: '#fff', color: '#333946',
          }}>刷新页面</button>
        </div>
      )}
      {!loading && !error && posts.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', border: '1px dashed #dfe3ea', borderRadius: 18, color: '#87909d', background: '#fff' }}>
          暂时还没有公开的表白内容。
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {posts.map(post => {
          const colors = categoryColors[post.category] || { background: '#eef1f6', color: '#5a6472' };
          const attachments = media[post.id] || [];
          return (
            <article key={post.id} style={{
              padding: 17, borderRadius: 18, border: '1px solid #e9ebf0',
              background: '#fff', boxShadow: '0 8px 28px #202a3d0a',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, background: colors.background, color: colors.color, borderRadius: 999, padding: '4px 10px' }}>{post.category}</span>
                <span style={{ fontSize: 11, color: '#8a93a1' }}>{timeAgo(post.created_at)}</span>
              </div>
              {post.recipient_name && <div style={{ marginTop: 10, fontSize: 12.5, color: '#333946' }}>TO · <b>{post.recipient_name}</b></div>}
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: '10px 0 12px', overflowWrap: 'anywhere', fontSize: 14.5 }}>{post.content}</p>
              {attachments.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: attachments.filter(item => item.kind === 'image').length === 1 ? '1fr' : 'repeat(3,minmax(0,1fr))', gap: 6, margin: '4px 0 10px' }}>
                  {attachments.map(item => item.url ? item.kind === 'image' ? (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                      <img src={item.url} alt="表白墙附件" loading="lazy" style={{ display: 'block', width: '100%', maxHeight: 340, objectFit: 'cover', borderRadius: 12 }} />
                    </a>
                  ) : (
                    <video key={item.id} src={item.url} controls playsInline preload="metadata" style={{ gridColumn: '1 / -1', width: '100%', maxHeight: 340, borderRadius: 12, background: '#000' }} />
                  ) : null)}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#606673' }}>{post.is_anonymous ? '匿名同学' : '班级同学'} · 已公开展示</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f2f6' }}>
                <button type="button" onClick={onLoginRequired} style={{ border: 0, background: 'transparent', color: '#5a6472', fontSize: 12.5, padding: 0 }}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, verticalAlign: -2, marginRight: 3 }}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>点赞</button>
                <button type="button" onClick={onLoginRequired} style={{ border: 0, background: 'transparent', color: '#5a6472', fontSize: 12.5, padding: 0 }}>评论（{Number(post.comment_count) || 0}）</button>
              </div>
            </article>
          );
        })}
      </div>

      <button type="button" onClick={onLoginRequired} style={{
        position: 'fixed', right: 18, bottom: 'calc(26px + env(safe-area-inset-bottom))',
        zIndex: 40, border: 0, borderRadius: 999, padding: '13px 20px',
        background: 'linear-gradient(135deg,#e0567a,#c22f3d)', color: '#fff',
        fontWeight: 800, fontSize: 14, boxShadow: '0 12px 28px rgba(194,47,61,.28)',
      }}>写表白</button>
    </main>
  );
}
