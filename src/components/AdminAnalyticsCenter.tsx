import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Totals = {
  members: number;
  joined_members: number;
  admins: number;
  new_members_7d: number;
  new_members_30d: number;
  posts: number;
  daily_posts: number;
  comments: number;
  photos: number;
  chat_messages: number;
  love_wall_posts: number;
  song_posts: number;
  board_messages: number;
  reports: number;
  content_active_7d: number;
  content_active_30d: number;
};

type DailyPoint = {
  day: string;
  signups: number;
  posts: number;
  daily_posts: number;
  comments: number;
  photos: number;
  chat_messages: number;
  love_wall_posts: number;
  song_posts: number;
  board_messages: number;
  content_active_members: number;
};

type AnalyticsData = {
  generated_at: string;
  days: number;
  totals: Totals;
  series: DailyPoint[];
};

const panel: React.CSSProperties = {
  background: 'linear-gradient(155deg,rgba(24,34,56,.94),rgba(12,18,33,.98))',
  border: '1px solid rgba(190,210,255,.13)', borderRadius: 18,
  padding: 14, marginBottom: 12, color: '#edf3ff',
};
const muted: React.CSSProperties = { color: '#98a8c5', fontSize: 11.5, lineHeight: 1.65 };
const metricStyle: React.CSSProperties = {
  minWidth: 0, padding: 12, borderRadius: 14,
  background: 'rgba(255,255,255,.045)', border: '1px solid rgba(190,210,255,.10)',
};

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <div style={metricStyle}>
    <div style={{ ...muted, fontSize: 11 }}>{label}</div>
    <div style={{ fontSize: 25, fontWeight: 850, letterSpacing: '-.5px', margin: '4px 0 2px' }}>{value.toLocaleString()}</div>
    {hint && <div style={{ ...muted, fontSize: 10.5 }}>{hint}</div>}
  </div>;
}

function TrendChart({ data }: { data: DailyPoint[] }) {
  const width = 620, height = 220, left = 34, right = 12, top = 14, bottom = 34;
  const values = data.flatMap(item => [item.posts, item.comments, item.photos, item.chat_messages]);
  const max = Math.max(1, ...values);
  const x = (i: number) => left + (data.length <= 1 ? 0 : i / (data.length - 1) * (width - left - right));
  const y = (value: number) => height - bottom - value / max * (height - top - bottom);
  const lines = [
    { key: 'posts', label: '动态', color: '#77a7ff' },
    { key: 'comments', label: '评论', color: '#b49aff' },
    { key: 'photos', label: '照片', color: '#75ddb0' },
    { key: 'chat_messages', label: '聊天消息', color: '#f4bd72' },
  ] as const;
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 3), Math.floor((data.length - 1) * 2 / 3), data.length - 1])];
  return <div style={{ overflowX: 'auto' }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="每日动态、评论、照片和聊天消息趋势" style={{ display: 'block', width: '100%', minWidth: 310, height: 'auto' }}>
      {[0, .25, .5, .75, 1].map(t => {
        const yy = height - bottom - t * (height - top - bottom);
        return <g key={t}>
          <line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#ffffff18" strokeDasharray="3 5" />
          <text x={left - 7} y={yy + 3} fill="#8292af" fontSize="9" textAnchor="end">{Math.round(max * t)}</text>
        </g>;
      })}
      {lines.map(line => {
        const points = data.map((item, index) => `${x(index)},${y(item[line.key])}`).join(' ');
        return <polyline key={line.key} points={points} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
      })}
      {labelIndexes.map(index => <text key={index} x={x(index)} y={height - 10} fill="#8292af" fontSize="9" textAnchor="middle">
        {new Date(data[index].day).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
      </text>)}
    </svg>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '0 4px' }}>
      {lines.map(line => <span key={line.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...muted }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: line.color }} />{line.label}
      </span>)}
    </div>
  </div>;
}

const countItems: Array<[keyof Totals, string]> = [
  ['posts', '社区动态'],
  ['daily_posts', '日常帖子'],
  ['comments', '评论'],
  ['photos', '相册照片'],
  ['chat_messages', '聊天消息'],
  ['love_wall_posts', '表白墙内容'],
  ['song_posts', '歌声墙内容'],
  ['board_messages', '普通留言'],
  ['reports', '累计举报'],
];

export default function AdminAnalyticsCenter({ setMsg }: { setMsg: (message: string) => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: result, error: rpcError } = await supabase.rpc('admin_analytics_overview', { p_days: days });
    if (rpcError) {
      setError(rpcError.message);
      setData(null);
      setMsg('数据分析读取失败：' + rpcError.message);
    } else {
      setData(result as AnalyticsData);
    }
    setLoading(false);
  }, [days, setMsg]);

  useEffect(() => { void load(); }, [load]);

  const totals = data?.totals;
  const recentDays = useMemo(() => (data?.series ?? []).slice(-7).reverse(), [data]);

  return <div style={{ display: 'grid', gap: 12 }}>
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 850 }}>数据分析中心</div>
          <div style={muted}>全站运营数据汇总 · 不展示成员身份和内容正文</div>
        </div>
        <button className="mini" disabled={loading} onClick={() => void load()}>{loading ? '刷新中…' : '刷新数据'}</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {[7, 14, 30, 90].map(value => <button key={value} className={'mini' + (days === value ? '' : ' ghost')} onClick={() => setDays(value)}>{value} 天</button>)}
      </div>
      {data && <div style={{ ...muted, marginTop: 8 }}>统计区间：近 {data.days} 天 · 更新于 {new Date(data.generated_at).toLocaleString()}</div>}
      {error && <p style={{ color: '#ff9da7', fontSize: 12.5, marginBottom: 0 }}>读取失败：{error}</p>}
    </section>

    {loading && !data ? <section style={panel}><p style={muted}>正在汇总数据…</p></section> : null}
    {totals && <>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9 }}>
        <Metric label="注册成员" value={totals.members} hint={`其中 ${totals.joined_members} 人已加入`} />
        <Metric label="近 7 天新增" value={totals.new_members_7d} hint={`近 30 天新增 ${totals.new_members_30d} 人`} />
        <Metric label="近 7 天内容活跃成员" value={totals.content_active_7d} hint="按发布、评论、上传或发送消息去重" />
        <Metric label="近 30 天内容活跃成员" value={totals.content_active_30d} hint="不是登录 DAU，不代表登录人数" />
      </section>

      <section style={panel}>
        <div style={{ fontSize: 14, fontWeight: 750, marginBottom: 8 }}>每日内容活动趋势</div>
        <TrendChart data={data?.series ?? []} />
        <p style={{ ...muted, margin: '8px 0 0' }}>按每日创建时间统计。已删除的动态和评论不计入；聊天仅统计消息数量，不读取消息正文。</p>
      </section>

      <section style={panel}>
        <div style={{ fontSize: 14, fontWeight: 750, marginBottom: 10 }}>内容累计统计</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
          {countItems.map(([key, label]) => <div key={key} style={{ padding: 10, borderRadius: 11, background: '#ffffff07', border: '1px solid #ffffff10' }}>
            <div style={muted}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{totals[key].toLocaleString()}</div>
          </div>)}
        </div>
      </section>

      <section style={panel}>
        <div style={{ fontSize: 14, fontWeight: 750, marginBottom: 8 }}>最近 7 天每日明细</div>
        <div style={{ display: 'grid', gap: 0 }}>
          {recentDays.map(day => <div key={day.day} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid #ffffff0d' }}>
            <span style={{ ...muted, minWidth: 74 }}>{new Date(day.day).toLocaleDateString()}</span>
            <span style={{ fontSize: 11.5, color: '#dce7ff', textAlign: 'right' }}>
              {day.signups} 注册 · {day.posts + day.comments + day.photos + day.chat_messages} 次内容活动 · {day.content_active_members} 位活跃成员
            </span>
          </div>)}
        </div>
      </section>
    </>}
    <section style={panel}>
      <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 6 }}>统计口径</div>
      <div style={muted}>“内容活跃成员”按当日有发布动态、评论、上传照片、普通留言、发送聊天、表白墙或歌声墙内容的不同账号去重。它不等于登录活跃人数。所有统计只返回聚合数值，不包含账号 ID、邮箱、聊天内容或帖子正文。</div>
    </section>
  </div>;
}
