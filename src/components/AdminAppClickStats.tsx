import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { card, h3, mut } from '../pages/admin/shared';

type Row = {
  id: number;
  created_at: string;
  profile_id: string | null;
  display_name: string | null;
  app: string;
  event: string;
  source: string;
  app_version_name: string | null;
  app_version_code: number | null;
  client_platform: string;
  device_label: string;
};

type Stats = {
  by_app: { app: string; total: number }[];
  by_event: { app: string; event: string; total: number }[];
  daily: { day: string; total: number }[];
};

const APP_LABEL: Record<string, string> = {
  main: '主站 App',
  admin: '管理版 App',
  musicdl: '音乐下载 App',
  radio: '电台 App',
  realworld: '真实世界 App',
  music: '音乐站',
  signature: '动态签名',
};

const EVENT_LABEL: Record<string, string> = {
  entry_click: '进入',
  download_click: '下载安装包',
  update_prompt_shown: '弹出更新框',
  update_click: '点更新',
  update_ignored: '忽略更新',
  copy_link: '复制下载链接',
  qr_view: '查看二维码',
};

const APPS = ['main', 'admin', 'musicdl', 'radio', 'realworld', 'music', 'signature'];
const RANGES: [number, string][] = [[7, '近 7 天'], [30, '近 30 天']];

export default function AdminAppClickStats({ setMsg }: { setMsg: (s: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [range, setRange] = useState(7);
  const [appFilter, setAppFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function load(days: number, app: string) {
    setLoading(true);
    const { data: statData, error: statError } = await (supabase as any).rpc('admin_app_click_stats', { p_days: days });
    const { data, error } = await (supabase as any).rpc('admin_list_app_click_events', {
      p_days: days, p_app: app === 'all' ? null : app, p_limit: 100,
    });
    if (statError || error) {
      setErr('读取失败：' + (statError?.message || error?.message || '请稍后重试。'));
      setRows([]);
      setStats(null);
    } else {
      setErr('');
      setStats((Array.isArray(statData) ? statData[0] : statData) as Stats | null);
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(range, appFilter); }, [range, appFilter]);

  const total = useMemo(() => (stats?.by_app ?? []).reduce((sum, x) => sum + Number(x.total || 0), 0), [stats]);
  const maxDaily = useMemo(() => Math.max(1, ...(stats?.daily ?? []).map(d => Number(d.total || 0))), [stats]);
  const eventRows = useMemo(() => {
    const list = (stats?.by_event ?? []).filter(x => appFilter === 'all' || x.app === appFilter);
    return list.sort((a, b) => Number(b.total) - Number(a.total)).slice(0, 12);
  }, [stats, appFilter]);

  return (
    <div>
      <div style={card}>
        <h3 style={h3}>软件点击统计</h3>
        <p style={mut}>谁点了哪个单独软件、点了多少次。只读。入口点一次记一次；二维码扫码本身无法统计，只记管理员点开二维码那一下；电台与真实世界目前站内没有入口，计数为 0。</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {RANGES.map(([days, label]) => (
            <button
              key={days}
              type="button"
              aria-pressed={range === days}
              onClick={() => setRange(days)}
              style={{
                border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 14px', fontSize: 13,
                background: range === days ? '#f6c453' : '#fff', color: range === days ? '#4a3716' : '#22314a', cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setMsg(''); void load(range, appFilter); }}
            style={{ border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 14px', fontSize: 13, background: '#fff', color: '#22314a', cursor: 'pointer' }}
          >
            刷新
          </button>
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>按软件汇总（{range} 天，共 {total} 次）</h3>
        {(stats?.by_app ?? []).map(x => (
          <div key={x.app} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, lineHeight: 2 }}>
            <span>{APP_LABEL[x.app] || x.app}</span>
            <b>{Number(x.total || 0)} 次</b>
          </div>
        ))}
        {(!stats || total === 0) && !loading && <p style={mut}>这段时间还没有点击记录。有人点过入口、更新框或复制链接后，这里会出现计数。</p>}
      </div>

      <div style={card}>
        <h3 style={h3}>按动作汇总</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {(['all', ...APPS] as string[]).map(k => (
            <button
              key={k}
              type="button"
              aria-pressed={appFilter === k}
              onClick={() => setAppFilter(k)}
              style={{
                border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 14px', fontSize: 13,
                background: appFilter === k ? '#f6c453' : '#fff', color: appFilter === k ? '#4a3716' : '#22314a', cursor: 'pointer',
              }}
            >
              {k === 'all' ? '全部软件' : (APP_LABEL[k] || k)}
            </button>
          ))}
        </div>
        {eventRows.length === 0 && !loading && <p style={{ ...mut, margin: '10px 0 0' }}>暂无动作记录。</p>}
        {eventRows.map(x => (
          <div key={`${x.app}-${x.event}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, lineHeight: 2 }}>
            <span>{APP_LABEL[x.app] || x.app} · {EVENT_LABEL[x.event] || x.event}</span>
            <b>{Number(x.total || 0)} 次</b>
          </div>
        ))}
      </div>

      <div style={card}>
        <h3 style={h3}>每日趋势</h3>
        {(stats?.daily ?? []).map(d => (
          <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, lineHeight: 1.9 }}>
            <span style={{ width: 86, color: '#5d6575' }}>{d.day.slice(5)}</span>
            <span style={{ flex: 1, height: 8, borderRadius: 99, background: '#eef1f6', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.round((Number(d.total || 0) / maxDaily) * 100)}%`, background: '#f6c453', borderRadius: 99 }} />
            </span>
            <b style={{ width: 30, textAlign: 'right' }}>{Number(d.total || 0)}</b>
          </div>
        ))}
      </div>

      {loading && <div style={card}><p style={mut}>正在读取…</p></div>}
      {!loading && err && <div style={card}><p style={mut}>{err}</p></div>}
      {!loading && !err && rows.length === 0 && <div style={card}><p style={mut}>暂无明细记录。</p></div>}

      {!loading && !err && rows.length > 0 && (
        <div style={card}>
          <h3 style={h3}>最近 100 条明细</h3>
          {rows.map(r => (
            <div key={r.id} style={{ borderTop: '1px solid #eef1f6', padding: '8px 0', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{APP_LABEL[r.app] || r.app} · {EVENT_LABEL[r.event] || r.event}</strong>
                <span style={{ fontSize: 12, color: '#7a8494' }}>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p style={{ ...mut, margin: '4px 0 0' }}>
                {r.display_name || '游客'} · 入口：{r.source || '—'} · {r.app_version_name ? `版本 ${r.app_version_name}${r.app_version_code ? `（${r.app_version_code}）` : ''} · ` : ''}{r.client_platform || '—'} · {r.device_label || '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
