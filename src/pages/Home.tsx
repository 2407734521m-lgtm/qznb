import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';

/**
 * 班级首页：沉浸式入口，全部来自真实数据
 */
function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
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
    (async () => {
      const { data: ss } = await supabase.from('site_settings').select('key, value');
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
        supabase.from('posts').select('id, author_id, content, created_at').is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(3),
        supabase.from('profiles').select('id, username, display_name, avatar_path, created_at')
          .eq('joined', true).order('created_at', { ascending: false }).limit(6),
        supabase.from('events').select('id, title, event_at, location').order('event_at', { ascending: true }).limit(3),
        supabase.from('wishes').select('id, content, created_at').order('created_at', { ascending: false }).limit(3),
      ]);
      setNotices(n.data ?? []); setPosts(p.data ?? []); setMembers(m.data ?? []);
      setEvents(e.data ?? []); setWishes(w.data ?? []);
      const ids = new Set<string>();
      (p.data ?? []).forEach((x: any) => ids.add(x.author_id));
      if (ids.size) {
        const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 100, skip: 0 });
        const mp: Record<string, string> = {};
        ((dir ?? []) as any[]).forEach((x: any) => { mp[x.id] = x.display_name ?? x.username; });
        setNames(mp);
      }
    })();
  }, []);

  // 毕业倒计时
  let countdown = '';
  if (gradDate) {
    const diff = new Date(gradDate).getTime() - Date.now();
    if (diff > 0) {
      const d = Math.floor(diff / 864e5);
      countdown = d > 0 ? `距离毕业还有 ${d} 天` : '毕业就在今天';
    } else countdown = '我们已经毕业';
  }

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e9ebf0', borderRadius: 18, padding: 16, marginBottom: 12,
    boxShadow: '0 8px 28px #202a3d0a',
  };

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      {/* 16:9 公告横幅：由管理员通过 site_settings 的 home_banner_url / home_banner_text 管理 */}
      <section className="home-banner" aria-label="班级公告横幅" onClick={() => nav('/board')}
        style={{ aspectRatio: '16 / 9', width: '100%', position: 'relative', overflow: 'hidden', borderRadius: 22, marginBottom: 18, background: bannerUrl ? '#f2f4f7' : 'linear-gradient(135deg,#f5f6f8,#e7eaf0)', border: '1px solid #e5e8ee', cursor: 'pointer', boxShadow: '0 12px 34px #202a3d0c' }}>
        {bannerUrl && <img src={bannerUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, background: bannerUrl ? 'linear-gradient(90deg,#101828a8,transparent)' : 'linear-gradient(120deg,#ffffff00,#dfe4ec66)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 'clamp(18px,5vw,30px)' }}>
          <span style={{ fontSize: 11, letterSpacing: 3, color: bannerUrl ? '#fff' : '#737b89', marginBottom: 8 }}>OUR CLASS · ANNOUNCEMENTS</span>
          <h2 style={{ margin: 0, fontSize: 'clamp(21px,5vw,32px)', lineHeight: 1.25, color: bannerUrl ? '#fff' : '#202632', fontWeight: 800 }}>{bannerText}</h2>
          <span style={{ fontSize: 12, marginTop: 10, color: bannerUrl ? '#ffffffd9' : '#687080' }}>查看班级公告　→</span>
        </div>
      </section>
      {/* 头部 */}
      <div style={{ textAlign: 'center', padding: '28px 16px 18px' }}>
        <h1 style={{
          margin: 0, fontSize: 30, fontWeight: 800,
          background: 'linear-gradient(135deg,#303642,#737b8a)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>{title}</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--mut)', fontSize: 14, letterSpacing: 4 }}>{subtitle}</p>
        {countdown && (
          <div style={{
            display: 'inline-block', marginTop: 12, padding: '8px 20px', borderRadius: 999,
            background: '#ffd47922', border: '1px solid #ffd47955', fontSize: 13.5, color: '#4b5563',
          }}>{countdown}</div>
        )}
      </div>

      {/* 公告 */}
      {notices.length > 0 && (
        <div style={card}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>班级公告</b>
            <button className="mini ghost" onClick={() => nav('/board')}>全部</button>
          </div>
          {notices.map(n => (
            <div key={n.id} onClick={() => setAnnPop(n)} style={{ fontSize: 13.5, padding: '7px 0', borderBottom: '1px solid #edf0f4', cursor: 'pointer' }}>
              {n.title && <b style={{ color: '#252a33' }}>{n.title} </b>}{(n.content || '').slice(0, 60)}
              <div style={{ color: 'var(--mut)', fontSize: 11.5 }}>{timeAgo(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}


      {/* 公告优先：快捷入口保留在公告之后 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        {([
          ['/members', '同学档案'],
          ['/feed', '班级动态'],
          ['/timeline', '青春回忆'],
          ['/capsule', '时光胶囊'],
          ['/wishes', '愿望墙'],
          ['/greetings', '留言墙'],
          ['/events', '班级活动'],
        ] as const).map(([to, label]) => (
          <button key={to} onClick={() => nav(to)} style={{
            ...card, marginBottom: 0, cursor: 'pointer', textAlign: 'center', padding: '20px 8px',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#252a33' }}>{label}</div>
          </button>
        ))}
      </div>

      {/* 最新动态 */}
      {posts.length > 0 && (
        <div style={card}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>最新动态</b>
            <button className="mini ghost" onClick={() => nav('/feed')}>全部</button>
          </div>
          {posts.map(p => (
            <div key={p.id} style={{ fontSize: 13.5, padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
              <span style={{ color: 'var(--mut)', fontSize: 12 }}>{names[p.author_id] || '…'} · </span>
              {(p.content || '').slice(0, 60)}
            </div>
          ))}
        </div>
      )}

      {/* 新成员 */}
      {members.length > 0 && (
        <div style={card}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>新加入的同学</b>
            <button className="mini ghost" onClick={() => nav('/members')}>全部</button>
          </div>
          <div className="row" style={{ gap: 10, overflowX: 'auto' }}>
            {members.map(m => (
              <div key={m.id} onClick={() => nav(`/member/${m.id}`)}
                style={{ cursor: 'pointer', textAlign: 'center', flexShrink: 0 }}>
                <Av path={m.avatar_path} name={m.display_name || m.username} />
                <div style={{ fontSize: 11.5, marginTop: 4, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.display_name || m.username}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 活动 */}
      {events.length > 0 && (
        <div style={card}>
          <b style={{ fontSize: 14 }}>近期活动</b>
          {events.map(e => (
            <div key={e.id} style={{ fontSize: 13.5, padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
              {e.title}
              <div style={{ color: 'var(--mut)', fontSize: 11.5 }}>
                {e.event_at ? new Date(e.event_at).toLocaleString() : ''}{e.location ? ` · ${e.location}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 愿望墙 */}
      {wishes.length > 0 && (
        <div style={card}>
          <b style={{ fontSize: 14 }}>愿望墙</b>
          {wishes.map(w => (
            <div key={w.id} style={{ fontSize: 13.5, padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
              {(w.content || '').slice(0, 80)}
            </div>
          ))}
        </div>
      )}
      {/* 公告弹窗 */}
      {annPop && (
        <div onClick={() => setAnnPop(null)} style={{
          position: 'fixed', inset: 0, zIndex: 200, background: '#20263266',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            ...card, width: '100%', maxWidth: 420, maxHeight: '70vh', overflowY: 'auto',
            padding: 18, position: 'relative',
          }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <b style={{ fontSize: 15 }}>{annPop.title || '班级公告'}</b>
              <button className="mini ghost" onClick={() => setAnnPop(null)}>关闭</button>
            </div>
            {annPop.is_pinned && <span style={{
              fontSize: 11, color: '#ffd98a', border: '1px solid #ffd98a55',
              borderRadius: 999, padding: '2px 8px', display: 'inline-block', marginBottom: 8,
            }}>📌 置顶</span>}
            <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#252a33' }}>
              {annPop.content}
            </div>
            <div style={{ color: 'var(--mut)', fontSize: 11.5, marginTop: 12 }}>{timeAgo(annPop.created_at)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
