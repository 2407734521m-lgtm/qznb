import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';

type Post = { id: number; author_id: string; content: string; image_url: string | null; created_at: string };
type Profile = { id: string; username: string; display_name: string | null; avatar_path: string | null };
type Notice = { id: number; title: string | null; content: string; created_at: string };
type EventItem = { id: number; title: string; event_at: string; location: string | null };

function timeAgo(value: string) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前';
  if (seconds < 86400 * 30) return Math.floor(seconds / 86400) + ' 天前';
  return new Date(value).toLocaleDateString();
}

function Avatar({ profile }: { profile?: Profile }) {
  const url = useSignedUrl('avatars', profile?.avatar_path);
  const label = profile?.display_name || profile?.username || '同学';
  return <span className="campus-avatar">{url ? <img src={url} alt="" /> : label.slice(0, 1)}</span>;
}

function FeedImage({ path }: { path: string }) {
  const url = useSignedUrl('media', path);
  return url ? <img className="campus-post-image" src={url} alt="动态配图" loading="lazy" /> : null;
}

export default function Campus() {
  const { session } = useAuth();
  const reduce = useReducedMotion();
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const now = new Date().toISOString();
        const [postResult, noticeResult, eventResult] = await Promise.all([
          supabase.from('posts').select('id, author_id, content, image_url, created_at')
            .is('deleted_at', null).order('created_at', { ascending: false }).limit(5),
          supabase.from('board_messages').select('id, title, content, created_at')
            .is('deleted_at', null).eq('is_admin_msg', true)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3),
          supabase.from('events').select('id, title, event_at, location')
            .gte('event_at', now).order('event_at', { ascending: true }).limit(3),
        ]);
        if (!active) return;
        if (postResult.error) throw postResult.error;
        setPosts((postResult.data || []) as Post[]);
        setNotices((noticeResult.data || []) as Notice[]);
        setEvents((eventResult.data || []) as EventItem[]);
        const ids = [...new Set((postResult.data || []).map((p: any) => p.author_id).filter(Boolean))];
        if (ids.length) {
          // Use the privacy-aware directory RPC instead of selecting profile rows directly.
          const { data, error: profileError } = await supabase.rpc('member_directory', { q: '', lim: 50, skip: 0 });
          if (profileError) throw profileError;
          if (active) {
            const map: Record<string, Profile> = {};
            ((data || []) as Profile[]).filter(profile => ids.includes(profile.id))
              .forEach(profile => { map[profile.id] = profile; });
            setProfiles(map);
          }
        }
      } catch (e: any) {
        if (active) setError(e?.message || '暂时无法加载社区动态，请稍后重试。');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const displayName = session?.user?.user_metadata?.username || '同学';
  const firstName = String(displayName).slice(0, 12);

  return (
    <motion.main className="campus-page"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}>
      <section className="campus-hero">
        <div className="campus-hero-copy">
          <span className="campus-eyebrow"><span className="campus-live-dot" /> CAMPUS COMMUNITY</span>
          <h1>校园广场<span>，</span><br />让每个声音被听见。</h1>
          <p>校园新鲜事、同学动态与班级日常，在这里相遇。</p>
          <div className="campus-hero-actions">
            <Link className="campus-primary-action" to="/feed">发布动态 <span aria-hidden="true">↗</span></Link>
            <Link className="campus-secondary-action" to="/members">认识同学</Link>
          </div>
        </div>
        <div className="campus-hero-orbit" aria-hidden="true">
          <div className="campus-orbit campus-orbit-one" />
          <div className="campus-orbit campus-orbit-two" />
          <div className="campus-orbit-core"><span>校</span></div>
          <span className="campus-orbit-label campus-orbit-label-a">SHARE</span>
          <span className="campus-orbit-label campus-orbit-label-b">CONNECT</span>
        </div>
      </section>

      <section className="campus-section">
        <div className="campus-section-heading">
          <div><span className="campus-kicker">YOUR CAMPUS, YOUR SPACE</span><h2>探索校园</h2></div>
          <span className="campus-section-note">找到属于你的圈子</span>
        </div>
        <div className="campus-shortcuts">
          <Link to="/feed" className="campus-shortcut campus-shortcut-blue">
            <span className="campus-shortcut-icon">↗</span><span><b>校园动态</b><small>分享日常与新鲜事</small></span><span className="campus-shortcut-arrow">→</span>
          </Link>
          <Link to="/classes" className="campus-shortcut campus-shortcut-green">
            <span className="campus-shortcut-icon">◎</span><span><b>班级空间</b><small>邀请码加入班级</small></span><span className="campus-shortcut-arrow">→</span>
          </Link>
          <Link to="/board" className="campus-shortcut campus-shortcut-amber">
            <span className="campus-shortcut-icon">✳</span><span><b>校园公告</b><small>查看重要通知</small></span><span className="campus-shortcut-arrow">→</span>
          </Link>
          <Link to="/events" className="campus-shortcut campus-shortcut-violet">
            <span className="campus-shortcut-icon">▦</span><span><b>活动日历</b><small>看看接下来有什么</small></span><span className="campus-shortcut-arrow">→</span>
          </Link>
        </div>
      </section>

      <div className="campus-content-grid">
        <section className="campus-section campus-feed-preview">
          <div className="campus-section-heading">
            <div><span className="campus-kicker">FROM THE COMMUNITY</span><h2>最近的动态</h2></div>
            <Link className="campus-text-link" to="/feed">查看全部 <span aria-hidden="true">→</span></Link>
          </div>
          {loading ? <div className="campus-state"><span className="campus-spinner" />正在加载社区动态…</div> :
            error ? <div className="campus-state campus-state-error"><p>暂时无法加载动态。</p><small>{error}</small><button onClick={() => window.location.reload()}>重新加载</button></div> :
            posts.length === 0 ? <div className="campus-empty"><span>✳</span><b>这里还很安静</b><p>发布第一条动态，让校园广场热闹起来。</p><Link to="/feed">去发布动态 →</Link></div> :
            <div className="campus-post-list">{posts.map(post => {
              const profile = profiles[post.author_id];
              return <article className="campus-post" key={post.id}>
                <div className="campus-post-top"><Avatar profile={profile} /><div className="campus-post-author"><b>{profile?.display_name || profile?.username || '校园同学'}</b><small>{timeAgo(post.created_at)}</small></div><span className="campus-post-mark">动态</span></div>
                {post.content && <p className="campus-post-content">{post.content}</p>}
                {post.image_url && <FeedImage path={post.image_url} />}
                <div className="campus-post-footer"><span>来自校园社区</span><Link to="/feed">参与讨论 →</Link></div>
              </article>;
            })}</div>
          }
        </section>

        <aside className="campus-side-column">
          <section className="campus-side-card">
            <div className="campus-side-title"><span className="campus-side-icon">✦</span><div><b>校园公告</b><small>IMPORTANT UPDATES</small></div><Link to="/board" aria-label="查看全部公告">→</Link></div>
            {notices.length ? notices.map(notice => <Link to="/board" className="campus-notice" key={notice.id}>
              <span className="campus-notice-dot" /><span><b>{notice.title || '校园通知'}</b><small>{timeAgo(notice.created_at)}</small></span>
            </Link>) : <p className="campus-side-empty">暂无公告，新的消息会显示在这里。</p>}
          </section>
          <section className="campus-side-card">
            <div className="campus-side-title"><span className="campus-side-icon campus-side-icon-warm">▦</span><div><b>即将到来的活动</b><small>WHAT'S NEXT</small></div><Link to="/events" aria-label="查看全部活动">→</Link></div>
            {events.length ? events.map(event => <Link to="/events" className="campus-event" key={event.id}>
              <span className="campus-event-date"><b>{new Date(event.event_at).getDate()}</b><small>{new Date(event.event_at).toLocaleDateString(undefined, { month: 'short' })}</small></span>
              <span className="campus-event-copy"><b>{event.title}</b><small>{new Date(event.event_at).toLocaleString()} {event.location ? ' · ' + event.location : ''}</small></span>
            </Link>) : <p className="campus-side-empty">暂时没有即将开始的活动。</p>}
          </section>
          <section className="campus-join-card">
            <span className="campus-join-kicker">BETTER TOGETHER</span>
            <h3>校园生活，<br />不止于课堂。</h3>
            <p>分享兴趣、发现活动、认识更多同学。</p>
            <Link to="/members">探索班级与成员 <span aria-hidden="true">↗</span></Link>
          </section>
        </aside>
      </div>
      <footer className="campus-footer"><span>校园回声 · CAMPUS</span><span>让校园故事继续发生。</span><Link to="/home">青春档案 →</Link></footer>
    </motion.main>
  );
}
