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
      });
      const nowIso = new Date().toISOString();
      const [n, p, m, e, w] = await Promise.all([
        supabase.from('board_messages').select('id, content, created_at')
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
    background: 'color-mix(in srgb,#141824 72%,transparent)',
    backdropFilter: 'blur(24px) saturate(1.6)', WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
    border: '1px solid #ffffff1c', borderRadius: 16, padding: 14, marginBottom: 12,
  };

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      {/* 头部 */}
      <div style={{ textAlign: 'center', padding: '28px 16px 18px' }}>
        <h1 style={{
          margin: 0, fontSize: 30, fontWeight: 800,
          background: 'linear-gradient(135deg,var(--a),var(--b))',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>{title}</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--mut)', fontSize: 14, letterSpacing: 4 }}>{subtitle}</p>
        {countdown && (
          <div style={{
            display: 'inline-block', marginTop: 12, padding: '8px 20px', borderRadius: 999,
            background: '#ffd47922', border: '1px solid #ffd47955', fontSize: 13.5, color: '#ffd479',
          }}>{countdown}</div>
        )}
      </div>

      {/* 快捷入口（文字版，无图标） */}
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
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', textShadow: '0 1px 8px #000a' }}>{label}</div>
          </button>
        ))}
      </div>

      {/* 公告 */}
      {notices.length > 0 && (
        <div style={card}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>班级公告</b>
            <button className="mini ghost" onClick={() => nav('/board')}>全部</button>
          </div>
          {notices.map(n => (
            <div key={n.id} onClick={() => setAnnPop(n)} style={{ fontSize: 13.5, padding: '7px 0', borderBottom: '1px solid #ffffff0c', cursor: 'pointer' }}>
              {(n.content || '').slice(0, 60)}
              <div style={{ color: 'var(--mut)', fontSize: 11.5 }}>{timeAgo(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}

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
          position: 'fixed', inset: 0, zIndex: 200, background: '#000a',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            ...card, width: '100%', maxWidth: 420, maxHeight: '70vh', overflowY: 'auto',
            padding: 18, position: 'relative',
          }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <b style={{ fontSize: 15 }}>班级公告</b>
              <button className="mini ghost" onClick={() => setAnnPop(null)}>关闭</button>
            </div>
            {annPop.is_pinned && <span style={{
              fontSize: 11, color: '#ffd98a', border: '1px solid #ffd98a55',
              borderRadius: 999, padding: '2px 8px', display: 'inline-block', marginBottom: 8,
            }}>📌 置顶</span>}
            <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#fff' }}>
              {annPop.content}
            </div>
            <div style={{ color: 'var(--mut)', fontSize: 11.5, marginTop: 12 }}>{timeAgo(annPop.created_at)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
