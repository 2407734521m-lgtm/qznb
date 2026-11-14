import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { card, h3, mut } from '../pages/admin/shared';

type Row = {
  id: number;
  created_at: string;
  song_id: string;
  song_name: string;
  artist: string;
  status: string;
  file_size: number | null;
  error: string | null;
  device_label: string;
  site_user_id: string | null;
  site_username: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  success: '下载成功',
  failed: '下载失败',
  unavailable: '下不了',
};

const FILTERS: [string, string][] = [
  ['all', '全部'],
  ['success', '下载成功'],
  ['failed', '下载失败'],
  ['unavailable', '下不了'],
];

function fmtSize(n: number | null) {
  if (n == null) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

export default function AdminMusicDownloads({ setMsg }: { setMsg?: (s: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase.from('music_download_logs')
      .select('id, created_at, song_id, song_name, artist, status, file_size, error, device_label, site_user_id, site_username')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { setErr('读取失败：' + error.message); setRows([]); }
        else { setErr(''); setRows((data ?? []) as Row[]); }
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, success: 0, failed: 0, unavailable: 0 };
    rows.forEach(r => { if (c[r.status] != null) c[r.status] += 1; });
    return c;
  }, [rows]);

  const shown = filter === 'all' ? rows : rows.filter(r => r.status === filter);

  return (
    <div>
      <div style={card}>
        <h3 style={h3}>音乐下载记录</h3>
        <p style={mut}>只读。记录来自「千栀音乐下载」下载页与 App：每次下载成功、失败、下不了都会记一条。最近 100 条。</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              style={{
                border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 14px', fontSize: 13,
                background: filter === k ? '#22314a' : '#fff', color: filter === k ? '#fff' : '#22314a', cursor: 'pointer',
              }}
            >
              {label}（{counts[k] ?? 0}）
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setMsg && setMsg(''); window.location.reload(); }}
            style={{ border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 14px', fontSize: 13, background: '#fff', color: '#22314a', cursor: 'pointer' }}
          >
            刷新
          </button>
        </div>
      </div>

      {loading && <div style={card}><p style={mut}>正在读取…</p></div>}
      {!loading && err && <div style={card}><p style={mut}>{err}</p></div>}
      {!loading && !err && shown.length === 0 && <div style={card}><p style={mut}>暂无记录。有人在下载页点过下载后，这里会出现记录。</p></div>}

      {shown.map(r => (
        <div key={r.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{r.song_name || '（未知歌名）'}{r.artist ? ' — ' + r.artist : ''}</strong>
            <span style={{ fontSize: 12, color: r.status === 'success' ? '#2e7d32' : r.status === 'failed' ? '#b0404f' : '#7a6f5d' }}>
              {STATUS_LABEL[r.status] || r.status}
            </span>
          </div>
          <p style={{ ...mut, margin: '6px 0 0' }}>
            {new Date(r.created_at).toLocaleString()} · 歌 ID {r.song_id} · {fmtSize(r.file_size)} · {r.device_label || '—'} · 本站账号：{r.site_username || '—'}
          </p>
          {r.error && <p style={{ ...mut, margin: '4px 0 0', color: '#b0404f' }}>原因：{r.error}</p>}
        </div>
      ))}
    </div>
  );
}
