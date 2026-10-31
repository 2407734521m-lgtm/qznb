import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';

type RecordItem = { id: string; title: string; detail: string; at: string; href: string };
type BadgeItem = { title: string; note: string; earned: boolean; date?: string; mark: string };
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString() : '—';
export default function MeGrowth() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinedAt, setJoinedAt] = useState('');
  const [activeDays, setActiveDays] = useState(0);
  const [counts, setCounts] = useState({ posts: 0, comments: 0, photos: 0, notices: 0, events: 0 });
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      const [profile, posts, comments, photos, board, regs] = await Promise.all([
        supabase.from('profiles').select('created_at').eq('id', me).maybeSingle(),
        supabase.from('posts').select('id,content,created_at,section').eq('author_id', me).is('deleted_at', null).order('created_at', { ascending: true }).limit(500),
        supabase.from('comments').select('id,content,created_at').eq('author_id', me).is('deleted_at', null).order('created_at', { ascending: true }).limit(500),
        supabase.from('album_photos').select('id,caption,created_at').eq('uploaded_by', me).order('created_at', { ascending: true }).limit(500),
        supabase.from('board_messages').select('id,title,content,created_at').eq('author_id', me).eq('is_admin_msg', false).is('deleted_at', null).order('created_at', { ascending: true }).limit(300),
        supabase.from('event_regs').select('event_id,created_at,events(title,event_at,location)').eq('profile_id', me).order('created_at', { ascending: false }).limit(100),
      ]);
      if (!alive) return;
      if ([profile, posts, comments, photos, board, regs].some(result => result.error)) setError('部分成长记录暂时无法读取，请稍后刷新。');
      const postRows = posts.data ?? [], commentRows = comments.data ?? [], photoRows = photos.data ?? [], boardRows = board.data ?? [], regRows = (regs.data ?? []) as any[];
      const allDates = [...postRows, ...commentRows, ...photoRows, ...boardRows, ...regRows].map((x: any) => x.created_at).filter(Boolean).map((x: string) => new Date(x).toISOString().slice(0, 10));
      const uniqueDays = [...new Set(allDates)].sort();
      setJoinedAt(profile.data?.created_at || '');
      setActiveDays(uniqueDays.length);
      setCounts({ posts: postRows.length, comments: commentRows.length, photos: photoRows.length, notices: boardRows.length, events: regRows.length });
      const items: RecordItem[] = [
        ...postRows.map((x: any) => ({ id: 'p'+x.id, title: '发布动态', detail: String(x.content || '分享了一条动态').slice(0, 90), at: x.created_at, href: '/feed' })),
        ...commentRows.map((x: any) => ({ id: 'c'+x.id, title: '发表评论', detail: String(x.content || '参与了社区讨论').slice(0, 90), at: x.created_at, href: '/feed' })),
        ...photoRows.map((x: any) => ({ id: 'a'+x.id, title: '上传相册照片', detail: String(x.caption || '为相册添加了一张照片').slice(0, 90), at: x.created_at, href: '/albums' })),
        ...boardRows.map((x: any) => ({ id: 'b'+x.id, title: '参与公告留言', detail: String(x.title || x.content || '在公告板留下记录').slice(0, 90), at: x.created_at, href: '/board' })),
        ...regRows.map((x: any) => ({ id: 'e'+x.event_id, title: '报名班级活动', detail: String(x.events?.title || '参与班级活动'), at: x.created_at, href: '/events' })),
      ].sort((a,b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setRecords(items.slice(0, 40));
      const earned: BadgeItem[] = [
        { title: '青春初见', note: '创建了自己的青春档案', earned: !!profile.data?.created_at, date: profile.data?.created_at, mark: '初见' },
        { title: '第一次分享', note: '发布第一条社区动态', earned: postRows.length > 0, date: postRows[0]?.created_at, mark: '分享' },
        { title: '留下影像', note: '上传第一张相册照片', earned: photoRows.length > 0, date: photoRows[0]?.created_at, mark: '影像' },
        { title: '热心互动', note: '累计发表 10 条评论', earned: commentRows.length >= 10, date: commentRows[9]?.created_at, mark: '互动' },
        { title: '活动同行', note: '报名参加第一次班级活动', earned: regRows.length > 0, date: regRows[regRows.length - 1]?.created_at, mark: '同行' },
        { title: '七日足迹', note: '在 7 个不同日期留下社区记录', earned: uniqueDays.length >= 7, date: uniqueDays[6] ? uniqueDays[6] + 'T12:00:00' : undefined, mark: '七日' },
      ];
      const created = profile.data?.created_at ? new Date(profile.data.created_at) : null;
      if (created) {
        const today = new Date();
        const anniversary = new Date(today.getFullYear(), created.getMonth(), created.getDate());
        const earnedThisYear = today.getFullYear() > created.getFullYear() && today >= anniversary;
        earned.push({ title: '周年纪念', note: '来到青春档案满一周年', earned: earnedThisYear, date: anniversary.toISOString(), mark: '纪念' });
      }
      setBadges(earned);
      setLoading(false);
    })().catch(() => { if (alive) { setError('成长档案加载失败，请检查网络后重试。'); setLoading(false); } });
    return () => { alive = false; };
  }, [me]);
  const earnedCount = badges.filter(x => x.earned).length;
  const eventRecords = records.filter(x => x.id.startsWith('e'));
  return (
    <main className="page" style={{ paddingBottom: 110, color: '#203b4b' }}>
      <BackButton fallback="/me" />
      <header style={{ margin: '8px 0 16px' }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#63818c' }}>GROWTH · COMMUNITY FOOTPRINT</div>
        <h1 style={{ fontSize: 23, margin: '5px 0' }}>成长档案</h1>
        <p style={{ margin: 0, color: '#748792', fontSize: 13 }}>每一次分享和参与，都是青春的一部分</p>
      </header>
      <section className="card" style={{ marginBottom: 12, background: 'linear-gradient(130deg,#164e63,#278b91)', color: '#fff' }}>
        <div style={{ fontSize: 12, opacity: .8 }}>社区活跃天数</div><div style={{ fontSize: 38, fontWeight: 800, margin: '5px 0' }}>{loading ? '—' : activeDays}</div>
        <div style={{ fontSize: 11, opacity: .82 }}>按发布、评论、上传、留言和活动报名日期统计，不把单纯在线时长计入</div>
        <div style={{ fontSize: 11, opacity: .75, marginTop: 8 }}>加入日期：{dateLabel(joinedAt)}</div>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>我的贡献</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          {Object.entries({ '发布动态': counts.posts, '参与评论': counts.comments, '上传照片': counts.photos, '公告留言': counts.notices, '活动报名': counts.events }).map(([label,value]) => <div key={label} style={{ padding: 12, borderRadius: 13, background: '#f4f8f9' }}><div style={{ fontSize: 23, fontWeight: 800, color: '#176477' }}>{loading ? '—' : value}</div><div style={{ fontSize: 11, color: '#71838b' }}>{label}</div></div>)}
        </div>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>社区荣誉与纪念徽章 <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 400 }}>{earnedCount}/{badges.length}</span></h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9 }}>
          {badges.map(b => <div key={b.title} style={{ padding: 12, borderRadius: 14, border: '1px solid ' + (b.earned ? '#c7e3e2' : '#e9eef0'), background: b.earned ? '#f0f8f7' : '#fafbfc', opacity: b.earned ? 1 : .62 }}>
            <div style={{ fontSize: 11, color: '#176477', fontWeight: 800 }}>{b.mark}</div><div style={{ fontSize: 13, fontWeight: 750, marginTop: 5 }}>{b.title}</div><div style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 3, lineHeight: 1.5 }}>{b.note}</div>{b.earned && <div style={{ fontSize: 10, color: '#63818c', marginTop: 6 }}>获得于 {dateLabel(b.date)}</div>}
          </div>)}
        </div>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><h2 style={{ fontSize: 15, margin: 0 }}>班级活动参与记录</h2><button className="mini ghost" onClick={() => nav('/events')}>查看活动 ›</button></div>
        {eventRecords.length === 0 ? <p style={{ color: 'var(--mut)', fontSize: 12 }}>还没有活动报名记录</p> : eventRecords.slice(0, 10).map(item => <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #edf1f3' }}><b style={{ fontSize: 12 }}>{item.detail}</b><div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 3 }}>{dateLabel(item.at)} · 已报名</div></div>)}
      </section>
      <section className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>最近贡献记录</h2>
        {loading && <p style={{ color: 'var(--mut)', fontSize: 12 }}>正在整理你的记录…</p>}{error && <p className="err" role="alert">{error}</p>}
        {!loading && records.length === 0 && <p style={{ color: 'var(--mut)', fontSize: 12 }}>还没有可展示的贡献记录</p>}
        {records.map(item => <button key={item.id} onClick={() => nav(item.href)} style={{ width: '100%', display: 'block', textAlign: 'left', padding: '10px 0', border: 0, borderBottom: '1px solid #edf1f3', background: 'transparent', color: 'inherit' }}><div style={{ fontSize: 12, fontWeight: 750 }}>{item.title}</div><div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 3 }}>{item.detail}</div><div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 3 }}>{new Date(item.at).toLocaleString()}</div></button>)}
      </section>
    </main>
  );
}
