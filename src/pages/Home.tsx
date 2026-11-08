import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { supabase } from '../lib/supabase';
import VisitCounter from '../components/VisitCounter';
import { useSignedUrls } from '../lib/media';
import { isInApp } from '../lib/installedApp';
import './Home.vibe.css';

/**
 * Editorial / immersive home: live content remains backed by existing Supabase queries.
 * The redesign changes presentation only; routes, visibility rules and data access stay intact.
 */
function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(s).toLocaleDateString();
}

function resolveHomeBannerTitle(value?: string | null) {
  const title = (value || '').trim();
  return !title || /^(测试|test|demo)$/i.test(title) ? '让分享与连接，自然发生。' : title;
}

function Av({ path, name, signedUrl }: { path: string | null; name: string; signedUrl?: string }) {
  return (
    <div className="av" style={{ width: 44, height: 44 }}>
      {signedUrl ? <img src={signedUrl} alt="" loading="lazy" decoding="async" /> : <span>{(name || '?').slice(0, 1)}</span>}
    </div>
  );
}

const SHORTCUTS = [
  ['/members', '成员'],
  ['/feed', '动态'],
  ['/timeline', '时间线'],
  ['/capsule', '胶囊'],
] as const;

export default function Home() {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLAnchorElement>(null);
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ['start end', 'end start'],
  });
  const heroImageY = useTransform(heroScrollProgress, [0, 1], reduceMotion ? [0, 0] : [-16, 16]);
  const [title, setTitle] = useState('堯');
  const [subtitle, setSubtitle] = useState('连接人与内容');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerText, setBannerText] = useState('让分享与连接，自然发生。');
  const [notices, setNotices] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [wishes, setWishes] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [annPop, setAnnPop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const memberAvatarUrls = useSignedUrls('avatars', members.map(member => member.avatar_path));

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const { data: ss, error: settingsError } = await supabase.from('site_settings').select('key, value');
        if (!live) return;
        (ss ?? []).forEach((x: any) => {
          if (x.key === 'site_title') setTitle(!x.value || ['我们的班级', 'class', 'class-youth-archive', '青春档案'].includes(x.value) ? '堯' : x.value);
          if (x.key === 'site_subtitle') setSubtitle(!x.value || x.value === '青春档案' ? '连接人与内容' : x.value);
          if (x.key === 'home_banner_url') setBannerUrl(x.value || '');
          if (x.key === 'home_banner_text') setBannerText(resolveHomeBannerTitle(x.value));
        });
        const nowIso = new Date().toISOString();
        const [n, p, m, e, w] = await Promise.all([
          supabase.from('board_messages').select('id, title, content, created_at')
            .eq('is_admin_msg', true).is('deleted_at', null)
            .in('audience', isInApp() ? ['all', 'app'] : ['all'])
            .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
            .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3),
          supabase.from('posts').select('id, author_id, content, created_at').eq('section', 'feed').is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(3),
          supabase.from('profiles').select('id, username, display_name, avatar_path, created_at')
            .eq('joined', true).order('created_at', { ascending: false }).limit(6),
          supabase.from('events').select('id, title, event_at, location')
            .or(`event_at.is.null,event_at.gte.${nowIso}`)
            .order('event_at', { ascending: true }).limit(3),
          supabase.from('wishes').select('id, content, created_at').order('created_at', { ascending: false }).limit(3),
        ]);
        if (!live) return;
        setNotices(n.data ?? []);
        setPosts(p.data ?? []);
        setMembers(m.data ?? []);
        setEvents(e.data ?? []);
        setWishes(w.data ?? []);
        setNames({});

        const hasQueryError = [settingsError, n.error, p.error, m.error, e.error, w.error].some(Boolean);
        if (hasQueryError) {
          setLoadError('部分首页内容暂时无法加载，请检查网络后重试。');
        }

        const ids = new Set<string>();
        (p.data ?? []).forEach((x: any) => ids.add(x.author_id));
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

  return (
    <div className="page vibe-home">


        {loading && (
          <div className="vh-load-state" role="status" aria-live="polite">
            <span className="vh-load-spinner" aria-hidden="true" />
            首页内容正在加载…
          </div>
        )}
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
            <span className="vh-brand-eyebrow">YOUR SPACE, YOUR STORIES</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>

        <Link
          ref={heroRef}
          className={`vh-hero${bannerUrl ? ' has-image' : ''}`}
          to="/board"
          aria-label="浏览公告"
        >
          {bannerUrl && <motion.img className="vh-hero-image" src={bannerUrl} alt="" style={reduceMotion ? undefined : { y: heroImageY, scale: 1.07 }} />}
          {bannerUrl && <div className="vh-hero-shade" />}
          <div className="vh-hero-content">
            <span className="vh-hero-kicker">公告</span>
            <h2 className="vh-hero-title">{bannerText}</h2>
            <p className="vh-hero-sub">最新公告与需要留意的站内消息，都在这里查看。</p>
            <span className="vh-hero-link">查看公告 <span aria-hidden="true">↗</span></span>
          </div>
        </Link>
      

      
        <button type="button" className="vh-search" aria-label="搜索全站内容"
          onClick={() => window.dispatchEvent(new CustomEvent('qznb:open-search'))}>
          <span className="vh-search-icon" aria-hidden="true">⌕</span>
          <span>搜索成员、动态、相册或公告</span>
        </button>
      

      

      

      {notices.length > 0 && (
        
          <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.14 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}>
            <div className="vh-section-head">
              <div><h2>公告</h2><p>需要留意的消息</p></div>
              <button className="vh-text-link" onClick={() => nav('/board')}>全部公告 ↗</button>
            </div>
            <div className="vh-notices">
              {notices.map((n, i) => (
                <button className="vh-notice" key={n.id} onClick={() => setAnnPop(n)}>
                  <span className="vh-notice-tag">{i === 0 ? '最新公告' : '站内消息'}</span>
                  <strong>{n.title || '公告'}</strong>
                  <p>{(n.content || '').slice(0, 100)}</p>
                  <time>{timeAgo(n.created_at)}</time>
                </button>
              ))}
            </div>
          </motion.section>
        
      )}

      
        <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.14 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}>
          <div className="vh-section-head">
            <div><h2>快速访问</h2><p>常用内容，一步到达</p></div>
          </div>
          <div className="vh-shortcuts">
            {SHORTCUTS.map(([to, label]) => (
              <button
                className="vh-shortcut"
                key={to}
                onClick={() => nav(to)}
              >
                <span className="vh-shortcut-name">{label}</span>
                <span className="vh-shortcut-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </motion.section>
      

      <motion.section className="vh-discovery-section" initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.14 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}>
        <div className="vh-section-head">
          <div><h2>继续探索</h2><p>除了动态，还有更多值得发现的角落</p></div>
          <span className="vh-discovery-index">DISCOVER MORE</span>
        </div>
        <div className="vh-discovery-grid">
          <button type="button" className="vh-discovery-card" onClick={() => nav('/love-wall')}>
            <span className="vh-discovery-symbol">♡</span><span className="vh-discovery-copy"><strong>表白墙</strong><small>看看大家留下的心意与故事</small></span><span className="vh-discovery-arrow">↗</span>
          </button>
          <button type="button" className="vh-discovery-card" onClick={() => nav('/wishes')}>
            <span className="vh-discovery-symbol">✳</span><span className="vh-discovery-copy"><strong>愿望墙</strong><small>记录想法，也看看别人的愿望</small></span><span className="vh-discovery-arrow">↗</span>
          </button>
          <button type="button" className="vh-discovery-card" onClick={() => nav('/events')}>
            <span className="vh-discovery-symbol">◷</span><span className="vh-discovery-copy"><strong>近期活动</strong><small>了解正在进行和即将开始的安排</small></span><span className="vh-discovery-arrow">↗</span>
          </button>
        </div>
      </motion.section>

      <motion.section className="vh-lower-grid" initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.14 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}>
        {(posts.length > 0 || wishes.length > 0) && (
          
            <div className="vh-panel">
              <div className="vh-section-head" style={{ margin: '0 0 8px' }}>
                <div><h2>最新动态</h2><p>最近发布的内容</p></div>
                <button className="vh-text-link" onClick={() => nav('/feed')}>更多动态 ↗</button>
              </div>
              {posts.length ? posts.map(p => (
                <Link className="vh-feed-row" key={p.id} to="/feed" aria-label="查看动态">
                  <div className="vh-feed-copy">
                    <strong>{names[p.author_id] || '成员'} · {timeAgo(p.created_at)}</strong>
                    <p>{p.content || '分享了一条动态'}</p>
                  </div>
                  <span aria-hidden="true" style={{ color: '#9aabb8' }}>↗</span>
                </Link>
              )) : <div className="vh-empty">还没有新的动态。</div>}
              {wishes.length > 0 && (
                <div className="vh-event">
                  <strong>最近的心愿</strong>
                  <p>{(wishes[0].content || '').slice(0, 100)}</p>
                  <button className="vh-text-link" onClick={() => nav('/wishes')}>去愿望墙看看 ↗</button>
                </div>
              )}
            </div>
          
        )}
        <div>
          {members.length > 0 && (
            
              <div className="vh-panel">
                <div className="vh-section-head" style={{ margin: '0 0 12px' }}>
                  <div><h2>新成员</h2><p>最近加入这里的人</p></div>
                  <button className="vh-text-link" onClick={() => nav('/members')}>全部 ↗</button>
                </div>
                <div className="vh-members">
                  {members.map(m => (
                    <Link className="vh-member" key={m.id} to={`/member/${m.id}`} aria-label={`查看${m.display_name || m.username}的资料`}>
                      <Av path={m.avatar_path} name={m.display_name || m.username}
                        signedUrl={m.avatar_path ? memberAvatarUrls[m.avatar_path] : undefined} />
                      <span>{m.display_name || m.username}</span>
                    </Link>
                  ))}
                </div>
              </div>
            
          )}
          {events.length > 0 && (
            
              <div className="vh-panel" style={{ marginTop: 12 }}>
                <div className="vh-section-head" style={{ margin: '0 0 8px' }}>
                  <div><h2>近期活动</h2><p>即将开始的安排</p></div>
                  <button className="vh-text-link" onClick={() => nav('/events')}>活动日历 ↗</button>
                </div>
                {events.map(e => (
                  <div className="vh-event" key={e.id}>
                    <strong>{e.title}</strong>
                    <p>{e.event_at ? new Date(e.event_at).toLocaleString() : '时间待定'}{e.location ? ` · ${e.location}` : ''}</p>
                  </div>
                ))}
              </div>
            
          )}
        </div>
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
