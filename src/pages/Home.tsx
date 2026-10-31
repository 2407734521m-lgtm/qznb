import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';
import Reveal from '../components/Reveal';
import BlurText from '../components/fx/BlurText';
import ShinyText from '../components/fx/ShinyText';
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

function Av({ path, name }: { path: string | null; name: string }) {
  const url = useSignedUrl('avatars', path);
  return (
    <div className="av" style={{ width: 44, height: 44 }}>
      {url ? <img src={url} alt="" /> : <span>{(name || '?').slice(0, 1)}</span>}
    </div>
  );
}

const SHORTCUTS = [
  ['/members', '同学档案'],
  ['/feed', '班级动态'],
  ['/timeline', '青春回忆'],
  ['/capsule', '时光胶囊'],
  ['/wishes', '愿望墙'],
  ['/greetings', '留言墙'],
  ['/events', '班级活动'],
] as const;

export default function Home() {
  const nav = useNavigate();
  const [title, setTitle] = useState('我们的班级');
  const [subtitle, setSubtitle] = useState('青春档案');
  const [gradDate, setGradDate] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerText, setBannerText] = useState('把我们的青春，留在这里');
  const [notices, setNotices] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [wishes, setWishes] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [annPop, setAnnPop] = useState<any>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: ss } = await supabase.from('site_settings').select('key, value');
      if (!live) return;
      (ss ?? []).forEach((x: any) => {
        if (x.key === 'site_title') setTitle(x.value || '我们的班级');
        if (x.key === 'site_subtitle') setSubtitle(x.value || '青春档案');
        if (x.key === 'graduation_date') setGradDate(x.value || '');
        if (x.key === 'home_banner_url') setBannerUrl(x.value || '');
        if (x.key === 'home_banner_text') setBannerText(x.value || '把我们的青春，留在这里');
      });
      const nowIso = new Date().toISOString();
      const [n, p, m, e, w] = await Promise.all([
        supabase.from('board_messages').select('id, title, content, created_at')
          .eq('is_admin_msg', true).is('deleted_at', null)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3),
        supabase.from('posts').select('id, author_id, content, created_at').eq('section', 'feed').is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(3),
        supabase.from('profiles').select('id, username, display_name, avatar_path, created_at')
          .eq('joined', true).order('created_at', { ascending: false }).limit(6),
        supabase.from('events').select('id, title, event_at, location').order('event_at', { ascending: true }).limit(3),
        supabase.from('wishes').select('id, content, created_at').order('created_at', { ascending: false }).limit(3),
      ]);
      if (!live) return;
      setNotices(n.data ?? []);
      setPosts(p.data ?? []);
      setMembers(m.data ?? []);
      setEvents(e.data ?? []);
      setWishes(w.data ?? []);
      const ids = new Set<string>();
      (p.data ?? []).forEach((x: any) => ids.add(x.author_id));
      if (ids.size) {
        const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 100, skip: 0 });
        if (!live) return;
        const mp: Record<string, string> = {};
        ((dir ?? []) as any[]).forEach((x: any) => { mp[x.id] = x.display_name ?? x.username; });
        setNames(mp);
      }
    })();
    return () => { live = false; };
  }, []);

  let countdown = '';
  if (gradDate) {
    const diff = new Date(gradDate).getTime() - Date.now();
    if (diff > 0) {
      const d = Math.floor(diff / 864e5);
      countdown = d > 0 ? `距离毕业还有 ${d} 天` : '毕业就在今天';
    } else countdown = '我们已经毕业';
  }

  return (
    <div className="page vibe-home">
      <Reveal enter>
        <div className="vh-topline">
          <span className="vh-eyebrow">A PLACE FOR OUR MEMORIES</span>
          <span className="vh-live">青春档案 · 持续更新</span>
        </div>
        <section
          className={`vh-hero${bannerUrl ? ' has-image' : ''}`}
          aria-label="班级公告横幅"
          onClick={() => nav('/board')}
          style={{ cursor: 'pointer' }}
        >
          {bannerUrl && <img className="vh-hero-image" src={bannerUrl} alt="" />}
          {bannerUrl && <div className="vh-hero-shade" />}
          <div className="vh-hero-content">
            <span className="vh-hero-kicker">OUR CLASS · ANNOUNCEMENTS</span>
            <h2 className="vh-hero-title"><BlurText key={bannerText} text={bannerText} /></h2>
            <p className="vh-hero-sub">记录此刻，也收藏那些值得反复回看的日子。</p>
            <span className="vh-hero-link">浏览班级公告 <span aria-hidden="true">↗</span></span>
          </div>
        </section>
      </Reveal>

      <Reveal enter delay={0.08}>
        <header className="vh-intro">
          <div>
            <div className="vh-eyebrow">THE CLASS ARCHIVE</div>
            <h1>{title}</h1>
            <p><ShinyText text={subtitle} /></p>
          </div>
          {countdown && <div className="vh-countdown">{countdown}</div>}
        </header>
      </Reveal>

      {notices.length > 0 && (
        <Reveal>
          <section>
            <div className="vh-section-head">
              <div><h2>公告精选</h2><p>重要消息，及时了解</p></div>
              <button className="vh-text-link" onClick={() => nav('/board')}>全部公告 ↗</button>
            </div>
            <div className="vh-notices">
              {notices.map((n, i) => (
                <button className="vh-notice" key={n.id} onClick={() => setAnnPop(n)}>
                  <span className="vh-notice-tag">{i === 0 ? 'LATEST NOTICE' : 'CLASS UPDATE'}</span>
                  <strong>{n.title || '班级公告'}</strong>
                  <p>{(n.content || '').slice(0, 100)}</p>
                  <time>{timeAgo(n.created_at)}</time>
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      <Reveal enter delay={0.12}>
        <section>
          <div className="vh-section-head">
            <div><h2>探索我们的空间</h2><p>从这里进入每一段校园记忆</p></div>
          </div>
          <div className="vh-shortcuts">
            {SHORTCUTS.map(([to, label], i) => (
              <button
                className="vh-shortcut"
                key={to}
                onClick={() => nav(to)}
                style={{ '--vh-orb': i % 2 ? 'rgba(96,165,250,.13)' : 'rgba(20,184,166,.13)' } as React.CSSProperties}
              >
                <span className="vh-shortcut-index">0{i + 1}</span>
                <span className="vh-shortcut-name">{label}</span>
                <span className="vh-shortcut-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </section>
      </Reveal>

      <section className="vh-lower-grid">
        {(posts.length > 0 || wishes.length > 0) && (
          <Reveal>
            <div className="vh-panel">
              <div className="vh-section-head" style={{ margin: '0 0 8px' }}>
                <div><h2>最近发生</h2><p>社区里的新鲜片段</p></div>
                <button className="vh-text-link" onClick={() => nav('/feed')}>更多动态 ↗</button>
              </div>
              {posts.length ? posts.map(p => (
                <div className="vh-feed-row" key={p.id} onClick={() => nav('/feed')}>
                  <div className="vh-feed-copy">
                    <strong>{names[p.author_id] || '班级成员'} · {timeAgo(p.created_at)}</strong>
                    <p>{p.content || '分享了一条动态'}</p>
                  </div>
                  <span aria-hidden="true" style={{ color: '#9aabb8' }}>↗</span>
                </div>
              )) : <div className="vh-empty">还没有新的动态。</div>}
              {wishes.length > 0 && (
                <div className="vh-event">
                  <strong>愿望墙 · 最近心愿</strong>
                  <p>{(wishes[0].content || '').slice(0, 100)}</p>
                  <button className="vh-text-link" onClick={() => nav('/wishes')}>去愿望墙看看 ↗</button>
                </div>
              )}
            </div>
          </Reveal>
        )}
        <div>
          {members.length > 0 && (
            <Reveal>
              <div className="vh-panel">
                <div className="vh-section-head" style={{ margin: '0 0 12px' }}>
                  <div><h2>新加入的同学</h2><p>认识最近加入档案的成员</p></div>
                  <button className="vh-text-link" onClick={() => nav('/members')}>全部 ↗</button>
                </div>
                <div className="vh-members">
                  {members.map(m => (
                    <div className="vh-member" key={m.id} onClick={() => nav(`/member/${m.id}`)}>
                      <Av path={m.avatar_path} name={m.display_name || m.username} />
                      <span>{m.display_name || m.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          )}
          {events.length > 0 && (
            <Reveal>
              <div className="vh-panel" style={{ marginTop: 12 }}>
                <div className="vh-section-head" style={{ margin: '0 0 8px' }}>
                  <div><h2>近期活动</h2><p>一起参与下一段回忆</p></div>
                  <button className="vh-text-link" onClick={() => nav('/events')}>活动日历 ↗</button>
                </div>
                {events.map(e => (
                  <div className="vh-event" key={e.id}>
                    <strong>{e.title}</strong>
                    <p>{e.event_at ? new Date(e.event_at).toLocaleString() : '时间待定'}{e.location ? ` · ${e.location}` : ''}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {annPop && (
        <div className="vh-modal-backdrop" onClick={() => setAnnPop(null)}>
          <article className="vh-modal" onClick={e => e.stopPropagation()}>
            <button className="vh-modal-close" onClick={() => setAnnPop(null)}>关闭</button>
            <div className="vh-eyebrow" style={{ marginBottom: 12 }}>CLASS ANNOUNCEMENT</div>
            <h3>{annPop.title || '班级公告'}</h3>
            <p>{annPop.content}</p>
            <time style={{ color: '#97a3af', fontSize: 11 }}>{timeAgo(annPop.created_at)}</time>
          </article>
        </div>
      )}
    </div>
  );
}
