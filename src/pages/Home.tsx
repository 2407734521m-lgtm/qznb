import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';

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
  return <div className="av" style={{ width: 42, height: 42 }}>{url ? <img src={url} alt="" /> : <span>{(name || '?').slice(0, 1)}</span>}</div>;
}

export default function Home() {
  const nav = useNavigate();
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
      const nowIso = new Date().toISOString();
      const [n, p, m, e, w] = await Promise.all([
        supabase.from('board_messages').select('id, title, content, created_at, is_pinned')
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
      if (!live) return;
      setNotices(n.data ?? []); setPosts(p.data ?? []); setMembers(m.data ?? []);
      setEvents(e.data ?? []); setWishes(w.data ?? []);
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

  const glass: React.CSSProperties = {
    background: 'linear-gradient(145deg,rgba(255,255,255,.105),rgba(255,255,255,.035))',
    border: '1px solid rgba(196,255,231,.14)', borderRadius: 20,
    backdropFilter: 'blur(22px) saturate(1.35)', WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
    boxShadow: '0 14px 38px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.07)',
  };
  const quick = [
    { to: '/members', no: '01', title: '青春档案', sub: '认识每一位平中人', icon: '↗' },
    { to: '/timeline', no: '02', title: '时光长廊', sub: '把记忆留在这里', icon: '◷' },
    { to: '/feed', no: '03', title: '校园动态', sub: '分享此刻的生活', icon: '✳' },
    { to: '/events', no: '04', title: '校园活动', sub: '记录每一次相聚', icon: '⌁' },
    { to: '/wishes', no: '05', title: '青春心愿', sub: '写下未来的方向', icon: '✧' },
    { to: '/greetings', no: '06', title: '留言时刻', sub: '给同学与老师的话', icon: '↗' },
  ];

  return (
    <div className="page pz-home" style={{ paddingBottom: 104 }}>
      <section className="pz-hero">
        <div className="pz-orbit pz-orbit-one" /><div className="pz-orbit pz-orbit-two" />
        <div className="pz-hero-top">
          <div className="pz-crest" aria-label="原创临时视觉标志">
            <svg viewBox="0 0 64 72" role="img" aria-label="山峦与书页原创符号">
              <path d="M32 3 56 15v20c0 15-11 26-24 33C19 61 8 50 8 35V15Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <path d="m15 39 12-17 8 10 7-11 8 18Z" fill="currentColor" opacity=".88"/>
              <path d="M18 45q14-7 28 0M21 50q11-5 22 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div><div className="pz-kicker">SICHUAN · PINGCHANG</div><div className="pz-school">四川省平昌中学</div></div>
          <span className="pz-live"><i /> 青春记忆计划</span>
        </div>
        <div className="pz-hero-copy">
          <div className="pz-eyebrow"><span /> THE YOUTH ARCHIVE <span /></div>
          <h1>平中<span>·</span><br/>青春纪</h1>
          <p className="pz-tagline">让青春有迹可循，<br/>让每一段故事都有归处。</p>
          <p className="pz-intro">一座连接在校学生、老师与毕业校友的数字记忆空间。</p>
          <div className="pz-actions">
            <button className="pz-primary" onClick={() => nav('/members')}>进入青春档案 <span>↗</span></button>
            <button className="pz-secondary" onClick={() => nav('/timeline')}>探索时光长廊</button>
          </div>
        </div>
        <div className="pz-hero-bottom">
          <span><b>追求真理</b><i>·</i><b>服务人群</b></span>
          <span className="pz-scroll">SCROLL TO EXPLORE <span>↓</span></span>
        </div>
      </section>

      <section className="pz-section">
        <div className="pz-section-head"><div><div className="pz-kicker">A PLACE FOR EVERY STORY</div><h2>青春的每一种可能</h2></div><span className="pz-index">01 / EXPLORE</span></div>
        <div className="pz-feature-grid">
          {quick.map((item, i) => <button key={item.to} className={`pz-feature pz-feature-${i + 1}`} style={glass} onClick={() => nav(item.to)}>
            <div className="pz-feature-top"><span>{item.no} / ARCHIVE</span><span className="pz-feature-icon">{item.icon}</span></div>
            <div><h3>{item.title}</h3><p>{item.sub}</p></div><span className="pz-feature-arrow">↗</span>
          </button>)}
        </div>
      </section>

      {notices.length > 0 && <section className="pz-section">
        <div className="pz-section-head"><div><div className="pz-kicker">OFFICIAL NOTICE BOARD</div><h2>校园公告</h2></div><button className="pz-text-button" onClick={() => nav('/board')}>查看全部 ↗</button></div>
        <div className="pz-list-card" style={glass}>{notices.map((n, i) => <button className="pz-notice" key={n.id} onClick={() => setAnnPop(n)}><span className="pz-list-number">{String(i + 1).padStart(2, '0')}</span><span className="pz-notice-copy"><b>{n.title || '校园公告'}</b><small>{(n.content || '').slice(0, 76)}</small><em>{timeAgo(n.created_at)}</em></span><span className="pz-arrow">↗</span></button>)}</div>
      </section>}

      {posts.length > 0 && <section className="pz-section">
        <div className="pz-section-head"><div><div className="pz-kicker">FROM THE COMMUNITY</div><h2>此刻正在发生</h2></div><button className="pz-text-button" onClick={() => nav('/feed')}>更多动态 ↗</button></div>
        <div className="pz-list-card" style={glass}>{posts.map(p => <div className="pz-post" key={p.id}><span className="pz-post-dot" /><div><div className="pz-post-meta">{names[p.author_id] || '平中成员'} · {timeAgo(p.created_at)}</div><p>{(p.content || '').slice(0, 140)}</p></div></div>)}</div>
      </section>}

      {members.length > 0 && <section className="pz-section">
        <div className="pz-section-head"><div><div className="pz-kicker">PEOPLE OF PINGCHANG</div><h2>新加入的平中人</h2></div><button className="pz-text-button" onClick={() => nav('/members')}>认识大家 ↗</button></div>
        <div className="pz-members" style={glass}>{members.map(m => <button key={m.id} className="pz-member" onClick={() => nav(`/member/${m.id}`)}><Av path={m.avatar_path} name={m.display_name || m.username}/><span>{m.display_name || m.username}</span><small>新成员</small></button>)}</div>
      </section>}

      {(events.length > 0 || wishes.length > 0) && <section className="pz-section pz-bottom-grid">
        {events.length > 0 && <div><div className="pz-section-head"><div><div className="pz-kicker">GATHER TOGETHER</div><h2>近期活动</h2></div><button className="pz-text-button" onClick={() => nav('/events')}>全部 ↗</button></div><div className="pz-list-card" style={glass}>{events.map(e => <div className="pz-mini-item" key={e.id}><b>{e.title}</b><small>{e.event_at ? new Date(e.event_at).toLocaleString() : '时间待定'}{e.location ? ` · ${e.location}` : ''}</small></div>)}</div></div>}
        {wishes.length > 0 && <div><div className="pz-section-head"><div><div className="pz-kicker">LET YOUR DREAMS GLOW</div><h2>青春心愿</h2></div><button className="pz-text-button" onClick={() => nav('/wishes')}>写下心愿 ↗</button></div><div className="pz-list-card" style={glass}>{wishes.map(w => <div className="pz-mini-item" key={w.id}><p>“{(w.content || '').slice(0, 100)}”</p><small>{timeAgo(w.created_at)}</small></div>)}</div></div>}
      </section>}

      <footer className="pz-footer"><div className="pz-footer-mark">PZ<span>·</span>YOUTH</div><p>四川省平昌中学 · 青春记忆社区</p><small>追求真理，服务人群。记录青春，连接彼此。</small><span className="pz-footer-line" /></footer>

      {annPop && <div className="pz-modal-backdrop" onClick={() => setAnnPop(null)}><div className="pz-modal" style={glass} onClick={e => e.stopPropagation()}><div className="pz-modal-top"><span>校园公告 / NOTICE</span><button onClick={() => setAnnPop(null)}>关闭 ×</button></div><h3>{annPop.title || '校园公告'}</h3><div className="pz-modal-content">{annPop.content}</div><small>{timeAgo(annPop.created_at)}</small></div></div>}
    </div>
  );
}
