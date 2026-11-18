// 海外视频每日采集 · 第 2 步：多来源 + 统一结构 + 播放检测（只取元数据，不下载视频文件）
// 来源：DB overseas_video_sources 里 enabled=true 的行。
//   youtube channel -> 公开 RSS，无 Key，取最新 15 条
//   youtube search  -> YouTube Data API v3，需 YOUTUBE_API_KEY，每天最多 10 次搜索
//   archive search  -> Archive.org advancedsearch，无 Key，公共领域视频
//   pexels search   -> Pexels Video API，需 PEXELS_API_KEY
//   wikimedia search -> Wikimedia Commons MediaWiki API，无 Key，
//                      只自动接收 CC0 / 公共领域 / CC BY / CC BY-SA，其余进 license_pending
//   nasa search     -> NASA Images API，无 Key，NASA 原创为公共领域，
//                      描述里带第三方标记的进 license_pending
// 去重：(platform, external_video_id) 唯一 + content_hash；重复只计数不入库。
// 状态：新视频一律 pending_review（授权不明的进 license_pending），
//   copyright_status 按来源真实许可证判定；YouTube 官方嵌入只记 youtube_embed / unknown，
//   license_url 留空，不冒充已授权；必须管理员在后台审核后才可发布。
// 播放检测：有 file_url 的新视频入库前做 HEAD + Range + 首字节读取，分级写 playback_status；
//   HEAD 成功 ≠ 可播放，HEAD 只过第一关。检测失败（failed）的视频仍为 pending_review，
//   不自动发布（本来就不自动发布）。
// 失败：每个源最多重试 3 次，指数退避；单源失败不中断整轮，记进 run 记录。
//   来源表加载失败时也先写一条 failed 的 run 记录再抛错（后台“采集记录”里看得到）。
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const TRIGGER = process.argv.includes('--manual') ? 'manual' : 'cron';
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_YT_SEARCHES_PER_RUN = 10;
// Wikimedia 要求：请求头必须带含联系方式的 User-Agent
//（https://meta.wikimedia.org/wiki/User-Agent_policy）。
const WIKIMEDIA_UA = 'ClassMemory-qznb/1.0 (https://qianzhi.pw; overseas video harvester)';

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
// 去掉 Wikimedia extmetadata 里的 HTML 标签（Artist / Attribution / ImageDescription 常带 <a> 等），
// 顺带解几种常见实体；不做完整实体解码，够显示即可。
const stripHtml = (s) => String(s || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

// 统一数据结构：所有平台分支的原始对象先经过这里，再入库。
// license_name 是许可证原文（Wikimedia 的 LicenseShortName、NASA 的 'NASA public domain'），
// 随 20261117230000 迁移新增的列持久化；YouTube 等没有原文的留空。
function normalizeVideo(platform, raw) {
  return {
    platform,
    external_video_id: String(raw.external_video_id || raw.id || ''),
    title: (raw.title || '').trim(),
    description: raw.description || '',
    author: raw.author || '',
    thumbnail_url: raw.thumbnail_url || '',
    original_url: raw.original_url || '',
    embed_url: raw.embed_url || '',
    file_url: raw.file_url || '',
    license_type: raw.license_type || 'unknown',
    license_name: raw.license_name || '',
    license_url: raw.license_url || '',
    copyright_status: raw.copyright_status || 'unknown',
    attribution: raw.attribution || '',
    duration_seconds: raw.duration_seconds ?? null,
    published_at: raw.published_at || null,
    language: raw.language || 'en',
    category_id: raw.category_id ?? null,
    status: raw.status || 'pending_review',
  };
}

// 挂上 normalize 不覆盖的入库字段：来源、作者主页、内容哈希、播放检测默认值。
const attachMeta = (platform, source, raw, normalized) => ({
  ...normalized,
  source_id: source.id,
  author_url: raw.author_url || '',
  content_hash: hash(`${platform}:${normalized.external_video_id}`),
  playback_status: raw.playback_status || 'unchecked',
  playback_checked_at: raw.playback_checked_at || null,
});

async function harvestYoutubeRss(source) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(source.external_id)}`;
  const res = await fetchWithRetry(url);
  const text = await res.text();
  const entries = text.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const raw = entries.slice(0, 15).map((e) => {
    const id = xmlText(e, 'yt:videoId');
    const thumb = (e.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1] || '';
    return {
      external_video_id: id, category_id: source.category_id,
      title: xmlText(e, 'title'),
      author: xmlText(e, 'name'), author_url: xmlText(e, 'uri'),
      original_url: `https://www.youtube.com/watch?v=${id}`,
      embed_url: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnail_url: thumb, published_at: xmlText(e, 'published') || null,
      language: source.language || 'en', description: xmlText(e, 'media:description'),
      // YouTube 官方嵌入 ≠ 可转载许可：只记 youtube_embed，copyright_status 保持 unknown，
      // license_url 留空（RSS 不提供许可证链接）。
      license_type: 'youtube_embed', copyright_status: 'unknown',
      status: 'pending_review',
    };
  }).filter((v) => v.external_video_id);
  return raw.map((r) => attachMeta('youtube', source, r, normalizeVideo('youtube', r)));
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
  const raw = (data.items || []).map((it) => {
    const id = it.id?.videoId || '';
    return {
      external_video_id: id, category_id: source.category_id,
      title: it.snippet?.title || '',
      author: it.snippet?.channelTitle || '',
      author_url: `https://www.youtube.com/channel/${it.snippet?.channelId || ''}`,
      original_url: `https://www.youtube.com/watch?v=${id}`,
      embed_url: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnail_url: it.snippet?.thumbnails?.medium?.url || '',
      published_at: it.snippet?.publishedAt || null,
      language: source.language || 'en', description: it.snippet?.description || '',
      license_type: 'youtube_embed', copyright_status: 'unknown',
      status: 'pending_review',
    };
  }).filter((v) => v.external_video_id);
  return raw.map((r) => attachMeta('youtube', source, r, normalizeVideo('youtube', r)));
}

async function harvestArchiveSearch(source) {
  const q = new URLSearchParams({
    q: `mediatype:movies AND (${source.external_id})`,
    'fl[]': ['identifier', 'title', 'creator', 'description', 'publicdate'],
    rows: '10', output: 'json',
  });
  const res = await fetchWithRetry(`https://archive.org/advancedsearch.php?${q}`);
  const data = await res.json();
  const raw = (data.response?.docs || []).map((d) => ({
    external_video_id: d.identifier, category_id: source.category_id,
    title: d.title || d.identifier,
    author: d.creator || '', author_url: `https://archive.org/details/${d.identifier}`,
    original_url: `https://archive.org/details/${d.identifier}`,
    embed_url: `https://archive.org/embed/${d.identifier}`,
    thumbnail_url: `https://archive.org/services/img/${d.identifier}`,
    published_at: d.publicdate ? new Date(d.publicdate).toISOString() : null,
    language: source.language || 'en',
    description: Array.isArray(d.description) ? d.description[0] : (d.description || ''),
    license_type: 'unknown', copyright_status: 'unknown',
    status: 'pending_review',
  }));
  return raw.map((r) => attachMeta('archive', source, r, normalizeVideo('archive', r)));
}

async function harvestPexelsSearch(source) {
  if (!PEXELS_API_KEY) throw new Error('PEXELS_API_KEY not set, skip search source');
  const q = new URLSearchParams({ query: source.external_id, per_page: '10' });
  const res = await fetchWithRetry(`https://api.pexels.com/videos/search?${q}`, {
    headers: { Authorization: PEXELS_API_KEY },
  });
  const data = await res.json();
  const raw = (data.videos || []).map((v) => {
    // Pexels video 对象没有真实标题字段（只有 user.name / url 等）：
    // 标题一律留空并逐条记日志，不再拼 'Pexels video {id}'。
    console.log(`pexels ${v.id}: no title field in API response, title left empty`);
    // embed_url 不再存视频页面 URL（页面地址当 <iframe> src 会加载整个网页）；
    // 改为从 video_files 里选一个 mp4 直链存入 file_url，embed_url 留空。
    // 拿不到文件地址就两个都留空（后续播放检测跳过，仍为 unchecked）。
    const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.link);
    files.sort((a, b) => (b.width || 0) - (a.width || 0));
    return {
      external_video_id: String(v.id), category_id: source.category_id,
      title: '',
      author: v.user?.name || '', author_url: v.user?.url || '',
      original_url: v.url || '', embed_url: '',
      file_url: files[0]?.link || '',
      thumbnail_url: v.image || '',
      published_at: null, language: source.language || 'en',
      description: '', license_type: 'pexels', copyright_status: 'verified',
      duration_seconds: v.duration ?? null,
      status: 'pending_review',
    };
  });
  return raw.map((r) => attachMeta('pexels', source, r, normalizeVideo('pexels', r)));
}

// Wikimedia Commons 许可证映射：只自动接收明确允许的授权；
// 其余（CC BY-NC、CC BY-ND、GFDL、未知、空）一律 license_pending，等管理员确认。
// 注意顺序：'CC BY-SA' 含 'CC BY'，必须先判 BY-SA；'CC0' 与 'Public domain' 各自独立。
function mapWikimediaLicense(licenseShort) {
  const s = String(licenseShort || '');
  if (/CC0/i.test(s)) return { license_type: 'cc0', copyright_status: 'verified', status: 'pending_review' };
  if (/public domain/i.test(s)) return { license_type: 'public_domain', copyright_status: 'verified', status: 'pending_review' };
  if (/CC BY-SA/i.test(s)) return { license_type: 'cc_by_sa', copyright_status: 'verified', status: 'pending_review' };
  // 'CC BY-NC' / 'CC BY-ND' 开头也是 'CC BY'，必须先拦下，否则会被下一条误判为 cc_by。
  if (/CC BY-NC|CC BY-ND/i.test(s)) return { license_type: 'unknown', copyright_status: 'unknown', status: 'license_pending' };
  if (/CC BY/i.test(s)) return { license_type: 'cc_by', copyright_status: 'verified', status: 'pending_review' };
  return { license_type: 'unknown', copyright_status: 'unknown', status: 'license_pending' };
}

async function harvestWikimediaSearch(source) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `filetype:video ${source.external_id}`,
    gsrnamespace: '6', gsrlimit: '10',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '640',
  });
  const res = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${q}`, {
    headers: { 'User-Agent': WIKIMEDIA_UA },
  });
  const data = await res.json();
  const pages = Object.values(data.query?.pages || {});
  const raw = pages.map((p) => {
    const ii = p.imageinfo?.[0] || {};
    // 只收视频文件：filetype:video 已筛过，这里再按 mime 兜底一次。
    if (ii.mime && !String(ii.mime).startsWith('video/')) return null;
    if (!ii.url) return null;
    const meta = ii.extmetadata || {};
    const val = (k) => meta[k]?.value || '';
    const licenseShort = val('LicenseShortName');
    const mapped = mapWikimediaLicense(licenseShort);
    if (mapped.status === 'license_pending') {
      console.log(`wikimedia ${p.title}: license '${licenseShort || '(empty)'}' not auto-accepted, status=license_pending`);
    }
    // MediaWiki duration 单位是秒（浮点），取整；extmetadata.Duration 为主，imageinfo.duration 兜底。
    const durationRaw = meta.Duration?.value ?? ii.duration;
    const duration_seconds = durationRaw != null && durationRaw !== '' && Number.isFinite(Number(durationRaw))
      ? Math.round(Number(durationRaw)) : null;
    return {
      external_video_id: String(p.pageid || p.title || ''),
      category_id: source.category_id,
      title: String(p.title || '').replace(/^File:/, ''),
      author: stripHtml(val('Artist')),
      original_url: ii.descriptionurl || '',
      embed_url: '',
      file_url: ii.url,
      thumbnail_url: ii.thumburl || '',
      published_at: null, language: source.language || 'en',
      description: stripHtml(val('ImageDescription')),
      license_type: mapped.license_type,
      license_name: stripHtml(licenseShort),
      license_url: val('LicenseUrl'),
      copyright_status: mapped.copyright_status,
      attribution: stripHtml(val('Attribution')),
      duration_seconds,
      status: mapped.status,
    };
  }).filter(Boolean);
  return raw.map((r) => attachMeta('wikimedia', source, r, normalizeVideo('wikimedia', r)));
}

// NASA 描述里的第三方版权标记：出现任一标记即视为“可能含第三方素材”，进 license_pending。
function isNasaThirdParty(description, description508) {
  return /third party|copyright|©|not a NASA/i.test(`${description || ''}\n${description508 || ''}`);
}

async function harvestNasaSearch(source) {
  const q = new URLSearchParams({ q: source.external_id, media_type: 'video', page_size: '10' });
  const res = await fetchWithRetry(`https://images-api.nasa.gov/search?${q}`);
  const data = await res.json();
  const items = data.collection?.items || [];
  const out = [];
  for (const item of items) {
    const d = item.data?.[0] || {};
    if (!d.nasa_id) continue;
    // 每条再 GET 它的 href（collection.json 清单），从中挑一个 .mp4 直链作 file_url：
    // 优先含 'orig' 的，其次 medium，其余按清单顺序。
    let fileUrl = '';
    let onlyMov = false;
    try {
      const colRes = await fetchWithRetry(item.href);
      const files = await colRes.json();
      const list = Array.isArray(files) ? files : [];
      const mp4s = list.filter((u) => /\.mp4(\?|$)/i.test(String(u)));
      const movs = list.filter((u) => /\.mov(\?|$)/i.test(String(u)));
      if (mp4s.length) {
        fileUrl = mp4s.find((u) => /orig/i.test(u)) || mp4s.find((u) => /medium/i.test(u)) || mp4s[0];
      } else if (movs.length) {
        // 只有 .mov：原生 <video> 播不了，仍存地址但直接记 unsupported，不再发 HTTP 检测。
        fileUrl = movs[0];
        onlyMov = true;
      }
    } catch (e) {
      console.log(`nasa ${d.nasa_id}: collection.json fetch failed: ${e.message}`);
      continue;
    }
    if (!fileUrl) continue;
    // collection.json 给的是 http://images-assets.nasa.gov/...，CloudFront 会 301 到 https；
    // 入库前直接升 https（免一次跳转、免 https 页混 http 资源），再 encodeURI
    //（部分 nasa_id 含空格，如 'Seeing Earth as Only NASA Can'，裸空格不是合法 URL）。
    const nasaUrl = (u) => encodeURI(String(u || '').replace(/^http:\/\/images-assets\.nasa\.gov\//i, 'https://images-assets.nasa.gov/'));
    fileUrl = nasaUrl(fileUrl);
    const preview = (item.links || []).find((l) => l.rel === 'preview');
    const thirdParty = isNasaThirdParty(d.description, d.description_508);
    if (thirdParty) {
      console.log(`nasa ${d.nasa_id}: third-party marker in description, status=license_pending`);
    }
    const raw = {
      external_video_id: d.nasa_id, category_id: source.category_id,
      title: d.title || '',
      description: (d.description || '').trim(),
      author: d.secondary_creator || d.center || '',
      thumbnail_url: nasaUrl(preview?.href || ''),
      original_url: nasaUrl(`https://images.nasa.gov/details/${d.nasa_id}`),
      embed_url: '',
      file_url: fileUrl,
      // 无第三方标记的 NASA 原创内容为公共领域；有标记的一律 license_pending。
      // license_name 存公共领域说明原文（无第三方标记时为 'NASA public domain'），有标记的留空。
      license_type: thirdParty ? 'unknown' : 'nasa_public_domain',
      license_name: thirdParty ? '' : 'NASA public domain',
      license_url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
      copyright_status: thirdParty ? 'unknown' : 'verified',
      attribution: 'NASA',
      duration_seconds: null,
      published_at: d.date_created || null,
      language: source.language || 'en',
      status: thirdParty ? 'license_pending' : 'pending_review',
      playback_status: onlyMov ? 'unsupported' : 'unchecked',
      playback_checked_at: onlyMov ? new Date().toISOString() : null,
    };
    out.push(attachMeta('nasa', source, raw, normalizeVideo('nasa', raw)));
    await sleep(200); // NASA 无公布限流数字，放慢一点
  }
  return out;
}

// 播放检测：只做三项 HTTP 检查，不下载整个文件，不用 ffprobe。
//   1) HEAD（跟随重定向，20 秒超时）：失败 / 非 2xx → failed；
//   2) Content-Type 不是 video/* → unsupported（例如返回 text/html 说明是页面不是文件）；
//   3) Range: bytes=0-1023：返回 206 且带 Content-Range → 通过；
//      不支持 Range（无 206 且无 Accept-Ranges）→ 仍记 playable，但注明 range-unsupported
//      （<video> 逐段播需要 Range，但很多服务器不给 Range 也能顺序播，不判死刑）；
//      Range 本身非 2xx（如 Wikimedia 的 429 限流）→ 不是“文件坏了”，是这次没验成，
//      保持 unchecked（未验证），不判 playable 也不判 failed；
//   再读 Range 响应的前 2KB 就停（reader 上限 + cancel）：服务器若无视 Range 返回 200，
//   直接 arrayBuffer() 会把整个文件下下来，绝不能这样；读不到字节 → failed。
// HEAD 成功 ≠ 可播放：HEAD 只过第一关。
async function checkPlayback(fileUrl) {
  const checkedAt = new Date().toISOString();
  let headRes;
  try {
    headRes = await fetch(fileUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(20000) });
  } catch (e) {
    return { playback_status: 'failed', playback_checked_at: checkedAt, note: `HEAD failed: ${e.message}` };
  }
  if (!headRes.ok) {
    return { playback_status: 'failed', playback_checked_at: checkedAt, note: `HEAD HTTP ${headRes.status}` };
  }
  const contentType = headRes.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('video/')) {
    return { playback_status: 'unsupported', playback_checked_at: checkedAt, note: `Content-Type '${contentType}' is not video/*` };
  }
  let rangeRes;
  try {
    rangeRes = await fetch(fileUrl, { headers: { Range: 'bytes=0-1023' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  } catch (e) {
    return { playback_status: 'failed', playback_checked_at: checkedAt, note: `Range request failed: ${e.message}` };
  }
  if (!rangeRes.ok) {
    return { playback_status: 'unchecked', playback_checked_at: checkedAt, note: `Range HTTP ${rangeRes.status} (not verified)` };
  }
  const rangeType = rangeRes.headers.get('content-type') || '';
  if (rangeType && !rangeType.toLowerCase().startsWith('video/')) {
    return { playback_status: 'unsupported', playback_checked_at: checkedAt, note: `Range Content-Type '${rangeType}' is not video/*` };
  }
  let bytesRead = 0;
  try {
    const reader = rangeRes.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (value) bytesRead += value.byteLength;
      if (done || bytesRead >= 2048) break;
    }
    await reader.cancel().catch(() => {});
  } catch (e) {
    return { playback_status: 'failed', playback_checked_at: checkedAt, note: `Range body read failed: ${e.message}` };
  }
  if (bytesRead === 0) {
    return { playback_status: 'failed', playback_checked_at: checkedAt, note: 'Range response body empty (0 bytes read)' };
  }
  const hasRange = rangeRes.status === 206
    || (rangeRes.headers.get('content-range') || '') !== ''
    || (rangeRes.headers.get('accept-ranges') || '').toLowerCase().includes('bytes');
  if (!hasRange) {
    return { playback_status: 'playable', playback_checked_at: checkedAt, note: `range-unsupported (sequential playback only), Content-Type ${contentType}, ${bytesRead} bytes read` };
  }
  return { playback_status: 'playable', playback_checked_at: checkedAt, note: `Range 206, Content-Type ${contentType}, ${bytesRead} bytes read` };
}

async function main() {
  // 来源表加载失败也要先写一条 failed 的 run 记录（后台“采集记录”里看得到），再抛错；
  // 若写库本身也失败（例如 service key 无效），只记日志，不掩盖原始错误。
  // dry-run 不写库：此时只抛错。
  let sources;
  try {
    const { data, error: srcErr } = await supabase
      .from('overseas_video_sources').select('*').eq('enabled', true);
    if (srcErr) throw new Error(`load sources failed: ${srcErr.message}`);
    sources = data;
  } catch (e) {
    if (!DRY_RUN) {
      try {
        // 注意：supabase-js 的 insert 失败时不抛错，而是返回 { error }，
        // 必须显式检查 error，否则写失败会静默丢失。
        const { error: writeErr } = await supabase.from('overseas_harvest_runs').insert({
          trigger: TRIGGER, status: 'failed', finished_at: new Date().toISOString(),
          error: String(e.message || e).slice(0, 1000),
          log: `load sources failed: ${e.message || e}`,
        });
        if (writeErr) console.error(`failed to record failed run: ${writeErr.message}`);
      } catch (writeErr) {
        console.error(`failed to record failed run: ${writeErr.message}`);
      }
    }
    throw e;
  }
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
      else if (source.platform === 'wikimedia') items = await harvestWikimediaSearch(source);
      else if (source.platform === 'nasa') items = await harvestNasaSearch(source);
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
        // 播放检测：有 file_url 且尚未定级的新视频才测
        //（NASA 只有 .mov 的已在适配器里记为 unsupported，不重测）。
        // dry-run 也测：检测只是读请求不写库，dry-run 正好用它验证分级。
        if (item.file_url && (!item.playback_status || item.playback_status === 'unchecked')) {
          const check = await checkPlayback(item.file_url);
          item.playback_status = check.playback_status;
          item.playback_checked_at = check.playback_checked_at;
          logs.push(`${item.external_video_id}: playback ${check.playback_status} (${check.note})`);
        }
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
