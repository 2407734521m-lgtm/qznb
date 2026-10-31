import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';

type RecordItem = { id: string; title: string; detail: string; at: string; href: string };
type BadgeItem = { title: string; note: string; earned: boolean; date?: string; mark: string };
type GrowthCounts = { posts: number; comments: number; photos: number; notices: number; events: number };
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString() : '—';

export default function MeGrowth() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinedAt, setJoinedAt] = useState('');
  const [activeDays, setActiveDays] = useState<number | null>(null);
  const [counts, setCounts] = useState<GrowthCounts | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      const [profile, summaryResult, posts, comments, photos, board, regs] = await Promise.all([
        supabase.from('profiles').select('created_at').eq('id', me).maybeSingle(),
        (supabase as any).rpc('get_my_growth_summary'),
        // 下面这些列表只负责“最近记录”的展示；统计总数和活跃天数由数据库函数完整聚合。
        supabase.from('posts').select('id,content,created_at,section')
          .eq('author_id', me).is('deleted_at', null).order('created_at', { ascending: false }).limit(30),
        supabase.from('comments').select('id,content,created_at')
          .eq('author_id', me).is('deleted_at', null).order('created_at', { ascending: false }).limit(30),
        supabase.from('album_photos').select('id,caption,created_at')
          .eq('uploaded_by', me).order('created_at', { ascending: false }).limit(30),
        supabase.from('board_messages').select('id,title,content,created_at')
          .eq('author_id', me).eq('is_admin_msg', false).is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('event_regs').select('event_id,created_at,events(title,event_at,location)')
          .eq('profile_id', me).order('created_at', { ascending: false }).limit(30),
      ]);

      if (!alive) return;
      const postRows = posts.data ?? [];
      const commentRows = comments.data ?? [];
      const photoRows = photos.data ?? [];
      const boardRows = board.data ?? [];
      const regRows = (regs.data ?? []) as any[];

      if ([posts, comments, photos, board, regs].some(result => result.error)) {
        setError('部分最近贡献记录暂时无法读取；完整统计仍以数据库汇总结果为准。');
      }

      const items: RecordItem[] = [
        ...postRows.map((x: any) => ({ id: 'p' + x.id, title: x.section === 'daily' ? '发布日常' : '发布动态', detail: String(x.content || '分享了一条动态').slice(0, 90), at: x.created_at, href: x.section === 'daily' ? '/daily' : '/feed' })),
        ...commentRows.map((x: any) => ({ id: 'c' + x.id, title: '发表评论', detail: String(x.content || '参与了社区讨论').slice(0, 90), at: x.created_at, href: '/feed' })),
        ...photoRows.map((x: any) => ({ id: 'a' + x.id, title: '上传相册照片', detail: String(x.caption || '为相册添加了一张照片').slice(0, 90), at: x.created_at, href: '/albums' })),
        ...boardRows.map((x: any) => ({ id: 'b' + x.id, title: '参与公告留言', detail: String(x.title || x.content || '在公告板留下记录').slice(0, 90), at: x.created_at, href: '/board' })),
        ...regRows.map((x: any) => ({ id: 'e' + x.event_id, title: '报名班级活动', detail: String(x.events?.title || '参与班级活动'), at: x.created_at, href: '/events' })),
      ].filter(item => !!item.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setRecords(items.slice(0, 40));

      if (profile.error) {
        setError('个人档案信息暂时无法读取。');
      }
      setJoinedAt(profile.data?.created_at || '');

      const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
      if (summaryResult.error || !summary) {
        setCounts(null);
        setActiveDays(null);
        setBadges([]);
        setError('完整成长统计暂不可用，请检查数据库迁移是否已应用后重试。');
        setLoading(false);
        return;
      }

      const exactCounts: GrowthCounts = {
        posts: Number(summary.posts ?? 0),
        comments: Number(summary.comments ?? 0),
        photos: Number(summary.photos ?? 0),
        notices: Number(summary.notices ?? 0),
        events: Number(summary.events ?? 0),
      };
      const exactActiveDays = Number(summary.active_days ?? 0);
      setCounts(exactCounts);
      setActiveDays(exactActiveDays);

      const created = profile.data?.created_at ? new Date(profile.data.created_at) : null;
      const badgesEarned: BadgeItem[] = [
        { title: '青春初见', note: '创建了自己的青春档案', earned: !!profile.data?.created_at, date: profile.data?.created_at, mark: '初见' },
        { title: '第一次分享', note: '发布第一条社区动态', earned: !!summary.first_post_at, date: summary.first_post_at || undefined, mark: '分享' },
        { title: '留下影像', note: '上传第一张相册照片', earned: !!summary.first_photo_at, date: summary.first_photo_at || undefined, mark: '影像' },
        { title: '热心互动', note: '累计发表 10 条评论', earned: exactCounts.comments >= 10, date: summary.tenth_comment_at || undefined, mark: '互动' },
        { title: '活动同行', note: '报名参加第一次班级活动', earned: exactCounts.events > 0, date: summary.first_event_at || undefined, mark: '同行' },
        { title: '七日足迹', note: '在 7 个不同日期留下社区记录', earned: exactActiveDays >= 7, date: summary.seventh_active_day ? String(summary.seventh_active_day) + 'T12:00:00Z' : undefined, mark: '七日' },
      ];
      if (created) {
        const today = new Date();
        const anniversary = new Date(today.getFullYear(), created.getMonth(), created.getDate());
        const earnedThisYear = today.getFullYear() > created.getFullYear() && today >= anniversary;
        badgesEarned.push({ title: '周年纪念', note: '来到青春档案满一周年', earned: earnedThisYear, date: anniversary.toISOString(), mark: '纪念' });
      }
      setBadges(badgesEarned);
      setLoading(false);
    })().catch(() => {
      if (alive) {
        setError('成长档案加载失败，请检查网络后重试。');
        setCounts(null);
        setActiveDays(null);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [me, refreshKey]);

  const earnedCount = badges.filter(item => item.earned).length;
  const eventRecords = records.filter(item => item.id.startsWith('e'));

  return (
    <main className="page" style={{ paddingBottom: 110, color: '#203b4b' }}>
      <BackButton fallback="/me" />
      <header style={{ margin: '8px 0 16px' }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#63818c' }}>GROWTH · COMMUNITY FOOTPRINT</div>
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 23, margin: '5px 0' }}>成长档案</h1>
            <p style={{ margin: 0, color: '#748792', fontSize: 13 }}>每一次分享和参与，都是青春的一部分</p>
          </div>
          <button className="mini ghost" disabled={loading} onClick={() => setRefreshKey(value => value + 1)}>{loading ? '刷新中…' : '刷新'}</button>
        </div>
      </header>
      <section className="card" style={{ marginBottom: 12, background: 'linear-gradient(130deg,#164e63,#278b91)', color: '#fff' }}>
        <div style={{ fontSize: 12, opacity: .8 }}>社区活跃天数</div>
        <div style={{ fontSize: 38, fontWeight: 800, margin: '5px 0' }}>{loading || activeDays === null ? '—' : activeDays}</div>
        <div style={{ fontSize: 11, opacity: .82 }}>按发布、评论、上传、留言和活动报名的全部历史日期统计，不再受列表分页上限影响</div>
        <div style={{ fontSize: 11, opacity: .75, marginTop: 8 }}>加入日期：{dateLabel(joinedAt)}</div>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>我的贡献</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          {Object.entries({ '发布动态': counts?.posts, '参与评论': counts?.comments, '上传照片': counts?.photos, '公告留言': counts?.notices, '活动报名': counts?.events }).map(([label, value]) =>
            <div key={label} style={{ padding: 12, borderRadius: 13, background: '#f4f8f9' }}>
              <div style={{ fontSize: 23, fontWeight: 800, color: '#176477' }}>{loading || value === undefined || value === null ? '—' : value}</div>
              <div style={{ fontSize: 11, color: '#71838b' }}>{label}</div>
            </div>
          )}
        </div>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>社区荣誉与纪念徽章 <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 400 }}>{earnedCount}/{badges.length}</span></h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9 }}>
          {badges.map(item => <div key={item.title} style={{ padding: 12, borderRadius: 14, border: '1px solid ' + (item.earned ? '#c7e3e2' : '#e9eef0'), background: item.earned ? '#f0f8f7' : '#fafbfc', opacity: item.earned ? 1 : .62 }}>
            <div style={{ fontSize: 11, color: '#176477', fontWeight: 800 }}>{item.mark}</div>
            <div style={{ fontSize: 13, fontWeight: 750, marginTop: 5 }}>{item.title}</div>
            <div style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 3, lineHeight: 1.5 }}>{item.note}</div>
            {item.earned && <div style={{ fontSize: 10, color: '#63818c', marginTop: 6 }}>获得于 {dateLabel(item.date)}</div>}
          </div>)}
        </div>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>班级活动参与记录</h2>
          <button className="mini ghost" onClick={() => nav('/events')}>查看活动 ›</button>
        </div>
        {eventRecords.length === 0 ? <p style={{ color: 'var(--mut)', fontSize: 12 }}>还没有活动报名记录</p> : eventRecords.slice(0, 10).map(item =>
          <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #edf1f3' }}>
            <b style={{ fontSize: 12 }}>{item.detail}</b><div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 3 }}>{dateLabel(item.at)} · 已报名</div>
          </div>
        )}
      </section>
      <section className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>最近贡献记录 <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 400 }}>最近 40 条</span></h2>
        {loading && <p style={{ color: 'var(--mut)', fontSize: 12 }}>正在整理你的记录…</p>}
        {error && <p className="err" role="alert">{error}</p>}
        {!loading && records.length === 0 && <p style={{ color: 'var(--mut)', fontSize: 12 }}>还没有可展示的贡献记录</p>}
        {records.map(item => <button key={item.id} onClick={() => nav(item.href)} style={{ width: '100%', display: 'block', textAlign: 'left', padding: '10px 0', border: 0, borderBottom: '1px solid #edf1f3', background: 'transparent', color: 'inherit' }}>
          <div style={{ fontSize: 12, fontWeight: 750 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 3 }}>{item.detail}</div>
          <div style={{ fontSize: 10, color: 'var(--mut)', marginTop: 3 }}>{new Date(item.at).toLocaleString()}</div>
        </button>)}
      </section>
    </main>
  );
}
