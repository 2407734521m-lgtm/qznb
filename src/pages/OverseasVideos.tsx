import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  getOverseasPlayback,
  licenseLabel,
  playbackStatusLabel,
} from '../lib/overseasVideoPlayer';

// 海外视频前台：只读 status='published' 的视频（匿名可读）。
// 点封面才加载官方嵌入（youtube-nocookie），不点不加载，省流量；
// 只存元数据 + 官方嵌入，不下载、不转载。

type Category = { id: number; name: string; slug: string; sort_order: number; enabled: boolean };
type Video = {
  id: number; platform: string; external_video_id: string; source_id: number | null;
  category_id: number | null; title: string; author: string; original_url: string;
  embed_url: string; thumbnail_url: string; published_at: string | null; language: string;
  duration_seconds: number | null; description: string;
  // 以下字段随第二阶段迁移新增；迁移未执行时读到 undefined 即按缺省处理。
  license_type?: string | null; license_name?: string | null; license_url?: string | null;
  copyright_status?: string | null; file_url?: string | null; attribution?: string | null;
  playback_status?: string | null; playback_checked_at?: string | null;
};

const PLATFORM_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  pexels: 'Pexels',
  pixabay: 'Pixabay',
  archive: 'Archive.org',
  openverse: 'Openverse',
  wikimedia: 'Wikimedia Commons',
  nasa: 'NASA',
  peertube: 'PeerTube',
};

function fmtDate(s: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
}
function fmtDuration(sec: number | null) {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

export default function OverseasVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [shownCount, setShownCount] = useState(12);
  const [thumbFailed, setThumbFailed] = useState<Record<number, boolean>>({});
  const [playFailed, setPlayFailed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setShownCount(12);
  }, [catFilter, query]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      supabase.from('overseas_video_categories').select('id, name, slug, sort_order, enabled').eq('enabled', true).order('sort_order'),
      // 用 select('*') 而不用逐列点名：第二阶段迁移的新列（file_url 等）还没进库时，
      // 逐列点名会整条查询报错，select('*') 只会让新字段读到 undefined，前台照常展示旧字段。
      supabase.from('overseas_videos').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(100),
    ]).then(([cats, vids]) => {
      if (!alive) return;
      const firstErr = cats.error || vids.error;
      if (firstErr) {
        setErr('读取失败：' + firstErr.message);
        setVideos([]);
      } else {
        setErr('');
        setCategories((cats.data ?? []) as Category[]);
        setVideos((vids.data ?? []) as Video[]);
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const catName = useMemo(() => {
    const m = new Map<number, string>();
    categories.forEach(c => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter(v => {
      if (catFilter !== 'all' && String(v.category_id) !== catFilter) return false;
      if (q && !(v.title + ' ' + v.author).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [videos, catFilter, query]);

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>海外视频</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#5b6673', lineHeight: 1.7 }}>
          每天自动发现的海外优质视频，管理员审核后才会在这里出现。只放官方嵌入或授权直链播放，不下载、不转载。
          直链视频用原生播放器直接播；YouTube 在国内不翻墙打不开，点播放后如果一直转圈，可以点「在 YouTube 上观看」用能打开 YouTube 的网络再看。
        </p>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜标题或作者…"
          aria-label="搜索视频"
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: 12, padding: '10px 12px',
            borderRadius: 12, border: '1px solid #d9dee5', background: '#fff',
            color: '#1f2a3a', font: 'inherit', fontSize: 14,
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setCatFilter('all')}
            style={{
              border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 14px', fontSize: 13,
              background: catFilter === 'all' ? '#22314a' : '#fff', color: catFilter === 'all' ? '#fff' : '#22314a', cursor: 'pointer',
            }}
          >
            全部（{videos.length}）
          </button>
          {categories.map(c => {
            const n = videos.filter(v => v.category_id === c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatFilter(String(c.id))}
                style={{
                  border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 14px', fontSize: 13,
                  background: catFilter === String(c.id) ? '#22314a' : '#fff', color: catFilter === String(c.id) ? '#fff' : '#22314a', cursor: 'pointer',
                }}
              >
                {c.name}（{n}）
              </button>
            );
          })}
        </div>
      </div>

      {loading && <div className="card"><p style={{ margin: 0, fontSize: 13, color: '#5b6673' }}>正在读取…</p></div>}
      {!loading && err && <div className="card"><p style={{ margin: 0, fontSize: 13, color: '#b0404f' }}>{err}</p></div>}
      {!loading && !err && shown.length === 0 && (
        <div className="card">
          <p style={{ margin: 0, fontSize: 13, color: '#5b6673', lineHeight: 1.7 }}>
            {videos.length === 0
              ? '还没有已发布的视频，等管理员审核通过后这里会出现。'
              : '没有符合筛选的视频，换个分类或关键词试试。'}
          </p>
        </div>
      )}

      {shown.slice(0, shownCount).map(v => {
        const isPlaying = playingId === v.id;
        const playback = getOverseasPlayback(v);
        const playErr = !!playFailed[v.id];
        return (
          <article key={v.id} className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, lineHeight: 1.5 }}>{v.title || '（无标题）'}</h3>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#5b6673' }}>
              {v.author || '未知作者'}
              {fmtDate(v.published_at) ? ' · ' + fmtDate(v.published_at) : ''}
              {fmtDuration(v.duration_seconds) ? ' · ' + fmtDuration(v.duration_seconds) : ''}
              {' · '}{v.language || 'en'}
              {v.category_id != null && catName.get(v.category_id) ? ' · ' + catName.get(v.category_id) : ''}
              {' · '}{PLATFORM_LABEL[v.platform] || v.platform}
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#5b6673' }}>
              授权：{licenseLabel(v.license_type, v.license_name)}
              {v.license_url && (
                <> · <a href={v.license_url} target="_blank" rel="noreferrer" style={{ color: '#526b8c' }}>查看授权</a></>
              )}
              {v.attribution ? ` · 署名：${v.attribution}` : ''}
            </p>
            {v.playback_status === 'failed' && (
              <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#b0404f' }}>
                播放检测失败，点播放可能看不了，可直接点下面的原站链接查看。
              </p>
            )}
            {isPlaying ? (
              <div>
                {playback.kind === 'native-video' && !playErr && (
                  <video
                    controls
                    preload="metadata"
                    src={playback.src}
                    onError={() => setPlayFailed(cur => ({ ...cur, [v.id]: true }))}
                    style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', borderRadius: 12, display: 'block', background: '#000' }}
                  />
                )}
                {playback.kind === 'native-video' && playErr && (
                  <p style={{ margin: 0, fontSize: 13, color: '#b0404f', lineHeight: 1.7 }}>
                    视频加载失败，可能是网络或格式问题，可点下面的原站链接查看。
                  </p>
                )}
                {playback.kind === 'unsupported' && (
                  <p style={{ margin: 0, fontSize: 13, color: '#5b6673', lineHeight: 1.7 }}>
                    该格式浏览器可能无法直接播放，可点下面的原站链接在原站查看。
                  </p>
                )}
                {(playback.kind === 'youtube-iframe' || playback.kind === 'embed-iframe') && (
                  <iframe
                    src={playback.src}
                    title={v.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ width: '100%', aspectRatio: '16 / 9', border: 'none', borderRadius: 12, display: 'block' }}
                  />
                )}
                {playback.kind === 'none' && (
                  <p style={{ margin: 0, fontSize: 13, color: '#5b6673', lineHeight: 1.7 }}>
                    暂无可播放的地址，可点下面的原站链接查看。
                  </p>
                )}
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setPlayingId(null)}
                    style={{ border: '1px solid #d9dee5', borderRadius: 999, padding: '6px 13px', fontSize: 13, background: '#fff', color: '#22314a', cursor: 'pointer' }}
                  >
                    收起播放
                  </button>
                </div>
                {playback.kind === 'youtube-iframe' && (
                  <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#5b6673' }}>
                    YouTube 在国内不翻墙打不开，点播放后如果一直转圈，可以点下面的原站链接用能打开 YouTube 的网络再看。
                  </p>
                )}
              </div>
            ) : v.thumbnail_url ? (
              <button
                type="button"
                onClick={() => { setPlayFailed(cur => ({ ...cur, [v.id]: false })); setPlayingId(v.id); }}
                aria-label={'播放 ' + v.title}
                style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', position: 'relative' }}
              >
                {thumbFailed[v.id] ? (
                  <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 12, background: '#22314a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>封面加载不出来，点这里试播</div>
                ) : (
                  <img src={v.thumbnail_url} alt="" loading="lazy" onError={() => setThumbFailed(cur => ({ ...cur, [v.id]: true }))} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
                )}
                <span style={{
                  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                  width: 56, height: 56, borderRadius: '50%', background: 'rgba(20,28,40,.75)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                }}>▶</span>
              </button>
            ) : null}
            {v.description && (
              <p style={{
                margin: '10px 0 0', fontSize: 13, color: '#5b6673', lineHeight: 1.7,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {v.description.slice(0, 200)}
              </p>
            )}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
              {v.original_url && (
                <a href={v.original_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#526b8c' }}>
                  在 {PLATFORM_LABEL[v.platform] || '原站'} 上观看
                </a>
              )}
            </div>
          </article>
        );
      })}
      {shown.length > shownCount && (
        <button
          type="button"
          onClick={() => setShownCount(n => n + 12)}
          style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #d9dee5', background: '#fff', color: '#22314a', fontSize: 14, cursor: 'pointer' }}
        >
          加载更多（还剩 {shown.length - shownCount} 条）
        </button>
      )}
    </div>
  );
}
