// 海外视频每日采集 · 第 1 步骨架（只取元数据，不下载视频文件）
// 来源：DB overseas_video_sources 里 enabled=true 的行。
//   youtube channel -> 公开 RSS，无 Key，取最新 15 条
//   youtube search  -> YouTube Data API v3，需 YOUTUBE_API_KEY，每天最多 10 次搜索
//   archive search  -> Archive.org advancedsearch，无 Key，公共领域视频
//   pexels search   -> Pexels Video API，需 PEXELS_API_KEY
// 去重：(platform, external_video_id) 唯一 + content_hash；重复只计数不入库。
// 状态：一律 pending_review，copyright_status 一律 unknown（Pexels 除外，
// 许可证明确才标 pexels / verified），必须管理员在后台审核后才可发布。
// 失败：每个源最多重试 3 次，指数退避；单源失败不中断整轮，记进 run 记录。
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const TRIGGER = process.argv.includes('--manual') ? 'manual' : 'cron';
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_YT_SEARCHES_PER_RUN = 10;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. Do not put the service key in source files.');
  process.exit(2);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchWithRetry(url, options = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return `h${Math.abs(h).toString(36)}`;
};
const xmlText = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
};

async function harvestYoutubeRss(source) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(source.external_id)}`;
  const res = await fetchWithRetry(url);
  const text = await res.text();
  const entries = text.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.slice(0, 15).map((e) => {
    const id = xmlText(e, 'yt:videoId');
    const thumb = (e.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1] || '';
    return {
      platform: 'youtube', external_video_id: id, source_id: source.id,
      category_id: source.category_id, title: xmlText(e, 'title'),
      author: xmlText(e, 'name'), author_url: xmlText(e, 'uri'),
      original_url: `https://www.youtube.com/watch?v=${id}`,
      embed_url: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnail_url: thumb, published_at: xmlText(e, 'published') || null,
      language: source.language || 'en', description: xmlText(e, 'media:description'),
      license_type: 'embed_allowed', copyright_status: 'unknown',
      status: 'pending_review',
      content_hash: hash(`youtube:${id}`),
    };
  }).filter((v) => v.external_video_id);
}

async function harvestYoutubeSearch(source, budget) {
  if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY not set, skip search source');
  if (budget.used >= MAX_YT_SEARCHES_PER_RUN) throw new Error('daily YouTube search budget used up');
  budget.used += 1;
  const q = new URLSearchParams({
    part: 'snippet', q: source.external_id, type: 'video', order: 'date',
    publishedAfter: new Date(Date.now() - 30 * 864e5).toISOString(),
    maxResults: '10', key: YOUTUBE_API_KEY,
  });
  const res = await fetchWithRetry(`https://www.googleapis.com/youtube/v3/search?${q}`);
  const data = await res.json();
  if (data.error) throw new Error(`YouTube API: ${data.error.message}`);
  return (data.items || []).map((it) => {
    const id = it.id?.videoId || '';
    return {
      platform: 'youtube', external_video_id: id, source_id: source.id,
      category_id: source.category_id, title: it.snippet?.title || '',
      author: it.snippet?.channelTitle || '',
      author_url: `https://www.youtube.com/channel/${it.snippet?.channelId || ''}`,
      original_url: `https://www.youtube.com/watch?v=${id}`,
      embed_url: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnail_url: it.snippet?.thumbnails?.medium?.url || '',
      published_at: it.snippet?.publishedAt || null,
      language: source.language || 'en', description: it.snippet?.description || '',
      license_type: 'embed_allowed', copyright_status: 'unknown',
      status: 'pending_review', content_hash: hash(`youtube:${id}`),
    };
  }).filter((v) => v.external_video_id);
}

async function harvestArchiveSearch(source) {
  const q = new URLSearchParams({
    q: `mediatype:movies AND (${source.external_id})`,
    'fl[]': ['identifier', 'title', 'creator', 'description', 'publicdate'],
    rows: '10', output: 'json',
  });
  const res = await fetchWithRetry(`https://archive.org/advancedsearch.php?${q}`);
  const data = await res.json();
  return (data.response?.docs || []).map((d) => ({
    platform: 'archive', external_video_id: d.identifier, source_id: source.id,
    category_id: source.category_id, title: d.title || d.identifier,
    author: d.creator || '', author_url: `https://archive.org/details/${d.identifier}`,
    original_url: `https://archive.org/details/${d.identifier}`,
    embed_url: `https://archive.org/embed/${d.identifier}`,
    thumbnail_url: `https://archive.org/services/img/${d.identifier}`,
    published_at: d.publicdate ? new Date(d.publicdate).toISOString() : null,
    language: source.language || 'en',
    description: Array.isArray(d.description) ? d.description[0] : (d.description || ''),
    license_type: 'unknown', copyright_status: 'unknown',
    status: 'pending_review', content_hash: hash(`archive:${d.identifier}`),
  }));
}

async function harvestPexelsSearch(source) {
  if (!PEXELS_API_KEY) throw new Error('PEXELS_API_KEY not set, skip search source');
  const q = new URLSearchParams({ query: source.external_id, per_page: '10' });
  const res = await fetchWithRetry(`https://api.pexels.com/videos/search?${q}`, {
    headers: { Authorization: PEXELS_API_KEY },
  });
  const data = await res.json();
  return (data.videos || []).map((v) => ({
    platform: 'pexels', external_video_id: String(v.id), source_id: source.id,
    category_id: source.category_id, title: `Pexels video ${v.id}`,
    author: v.user?.name || '', author_url: v.user?.url || '',
    original_url: v.url || '', embed_url: v.url || '',
    thumbnail_url: v.image || '',
    published_at: null, language: source.language || 'en',
    description: '', license_type: 'pexels', copyright_status: 'verified',
    status: 'pending_review', content_hash: hash(`pexels:${v.id}`),
  }));
}

async function main() {
  const { data: sources, error: srcErr } = await supabase
    .from('overseas_video_sources').select('*').eq('enabled', true);
  if (srcErr) throw new Error(`load sources failed: ${srcErr.message}`);
  const budget = { used: 0 };
  const counts = { found: 0, fresh: 0, duplicate: 0, failed: 0 };
  const logs = [];
  let runId = null;
  if (!DRY_RUN) {
    const { data } = await supabase.from('overseas_harvest_runs')
      .insert({ trigger: TRIGGER, status: 'running' }).select('id').single();
    runId = data?.id ?? null;
  }
  for (const source of sources || []) {
    try {
      let items = [];
      if (source.platform === 'youtube' && source.source_type === 'channel') items = await harvestYoutubeRss(source);
      else if (source.platform === 'youtube' && source.source_type === 'search') items = await harvestYoutubeSearch(source, budget);
      else if (source.platform === 'archive') items = await harvestArchiveSearch(source);
      else if (source.platform === 'pexels') items = await harvestPexelsSearch(source);
      else { logs.push(`${source.name}: unsupported ${source.platform}/${source.source_type}, skipped`); continue; }
      counts.found += items.length;
      // 先查已入库的 external_video_id，准确区分新增 / 重复；再 upsert 新行。
      let existing = new Set();
      if (!DRY_RUN && items.length) {
        const { data } = await supabase.from('overseas_videos')
          .select('external_video_id').eq('platform', items[0].platform)
          .in('external_video_id', items.map((i) => i.external_video_id));
        existing = new Set((data || []).map((r) => r.external_video_id));
      }
      for (const item of items) {
        if (existing.has(item.external_video_id)) { counts.duplicate += 1; continue; }
        if (DRY_RUN) { counts.fresh += 1; continue; }
        const { error } = await supabase.from('overseas_videos')
          .upsert(item, { onConflict: 'platform,external_video_id', ignoreDuplicates: true });
        if (error) { counts.failed += 1; logs.push(`${item.external_video_id}: ${error.message}`); }
        else counts.fresh += 1;
      }
      await supabase.from('overseas_video_sources').update({ last_checked_at: new Date().toISOString() }).eq('id', source.id);
      logs.push(`${source.name}: found ${items.length}`);
    } catch (e) {
      counts.failed += 1;
      logs.push(`${source.name}: FAILED ${e.message}`);
    }
    await sleep(500); // 限流：源与源之间停半秒
  }
  const status = counts.failed > 0 && counts.fresh === 0 ? 'failed' : counts.failed > 0 ? 'partial' : 'success';
  console.log(JSON.stringify({ trigger: TRIGGER, dryRun: DRY_RUN, status, ...counts, logs }, null, 2));
  if (!DRY_RUN && runId) {
    await supabase.from('overseas_harvest_runs').update({
      finished_at: new Date().toISOString(), status,
      sources_checked: (sources || []).length, found_count: counts.found,
      new_count: counts.fresh, duplicate_count: counts.duplicate,
      failed_count: counts.failed, log: logs.join('\n').slice(0, 4000),
    }).eq('id', runId);
  }
  if (status === 'failed') process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
