// qianzhi-radio Worker — Mineradio 网页版 (radio.qianzhi.pw)
//
// 形态: 静态托管 public/ (Mineradio v2.2.0 渲染层, GPL-3.0, 见 ../LICENSE / ../NOTICE.md)
//       + /api/* 翻译层: 把 Mineradio 归一化形状翻译到现网 Workers 网易云 API
//         (https://music.qianzhi.pw/api/netease, XEAPI 4.41.1, 浏览器持有 Cookie 模式)。
// 登录 Cookie 只存访客浏览器 (本站域名 mr_session, HttpOnly), 服务端不落盘。
// 一期只接网易云; QQ/酷狗/汽水/Spotify 返回未开放形状 (入口已在渲染层隐藏)。

const XEAPI_BASE = 'https://music.qianzhi.pw/api/netease';
const SESSION_COOKIE = 'mr_session';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const APP_VERSION = '2.2.0';

// 本站账号（Supabase Auth）校验用：publishable key 是公开 key，不存任何密钥。
// 仅供下载页 /api/dl/* 门禁；Mineradio 主站 /api/* 不走这里。
const SUPABASE_URL = 'https://ldypnxxxgscibopgiaso.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BRt1PSH8umGRsfKE-0BDiw_H5IUUWKr';

// ---------------------------------------------------------------- utilities

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

async function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const text = await request.text().catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text); } catch (_) {}
  try {
    const out = {};
    new URLSearchParams(text).forEach((v, k) => { out[k] = v; });
    return out;
  } catch (_) { return {}; }
}

function hashString(value) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const s = String(value || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}

// ---------------------------------------------------------------- XEAPI client

async function xeapi(route, params = {}, cookieStr = '', timeoutMs = 9000) {
  const url = new URL(XEAPI_BASE + route);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  if (cookieStr) url.searchParams.set('cookie', cookieStr);
  url.searchParams.set('timestamp', String(Date.now()));
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let body = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch (_) { body = null; }
  let setCookies = [];
  try { setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : []; } catch (_) {}
  return { status: res.status, body, setCookies };
}

// ---------------------------------------------------------------- session cookie (browser-held)

function readSession(request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    if (part.slice(0, idx).trim() !== SESSION_COOKIE) continue;
    const raw = part.slice(idx + 1).trim();
    try { return decodeURIComponent(raw); } catch (_) { return raw; }
  }
  return '';
}

function sessionSetCookie(cookieStr) {
  return `${SESSION_COOKIE}=${encodeURIComponent(cookieStr)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

function sessionClearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function parseCookieString(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach(part => {
    const raw = String(part || '').trim();
    if (!raw) return;
    const idx = raw.indexOf('=');
    if (idx <= 0) return;
    out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  });
  return out;
}

function normalizeCookieHeader(raw) {
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  const pairs = [];
  for (const item of list) {
    String(item || '').split(/,(?=\s*[^;,=]+?=)/).forEach(piece => {
      const first = String(piece || '').split(';')[0].trim();
      if (first && first.includes('=')) pairs.push(first);
    });
  }
  const merged = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    merged[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ');
}

// 从 XEAPI 响应 (body.cookie 字段 + Set-Cookie 头) 提取网易云 cookie 串
function extractUpstreamCookie(xeRes) {
  const candidates = [];
  if (xeRes && xeRes.body) {
    if (xeRes.body.cookie) candidates.push(xeRes.body.cookie);
    if (xeRes.body.data && xeRes.body.data.cookie) candidates.push(xeRes.body.data.cookie);
  }
  if (xeRes && Array.isArray(xeRes.setCookies)) candidates.push(...xeRes.setCookies);
  for (const candidate of candidates) {
    const normalized = normalizeCookieHeader(candidate);
    if (normalized && parseCookieString(normalized).MUSIC_U) return normalized;
  }
  for (const candidate of candidates) {
    const normalized = normalizeCookieHeader(candidate);
    if (normalized) return normalized;
  }
  return '';
}

// ---------------------------------------------------------------- mapping (ported from Mineradio server.js)

function mapArtists(raw) {
  return (raw || [])
    .map(a => ({ id: a && a.id, name: (a && a.name) || '' }))
    .filter(a => a.name);
}

function mapSongRecord(s) {
  s = s || {};
  const artists = mapArtists(s.ar || s.artists);
  const album = s.al || s.album || {};
  return {
    provider: 'netease',
    source: 'netease',
    type: 'song',
    id: s.id,
    name: s.name,
    artist: artists.map(a => a.name).join(' / '),
    artists,
    artistId: artists[0] && artists[0].id,
    album: album.name || '',
    albumId: album.id || '',
    cover: album.picUrl || album.coverUrl || '',
    duration: s.dt || s.duration || 0,
    popularity: Number(s.pop || s.popularity || s.score || s.hotScore || 0) || 0,
    searchRank: s.rank === null || s.rank === undefined || s.rank === '' ? null : Number(s.rank),
    fee: s.fee,
  };
}

function mapDiscoverPlaylist(pl, tag) {
  pl = pl || {};
  const creator = pl.creator || pl.user || {};
  const id = pl.id || pl.resourceId || pl.creativeId;
  return {
    provider: 'netease',
    source: 'netease',
    type: 'playlist',
    id,
    name: pl.name || pl.title || '',
    cover: pl.picUrl || pl.coverImgUrl || pl.coverUrl || (pl.uiElement && pl.uiElement.image && pl.uiElement.image.imageUrl) || '',
    trackCount: pl.trackCount || pl.songCount || pl.programCount || 0,
    playCount: pl.playCount || pl.playcount || 0,
    creator: creator.nickname || creator.name || '',
    tag: tag || pl.alg || '',
  };
}

function mapNeteasePlaylistMeta(pl, fallbackId) {
  pl = pl || {};
  return {
    id: pl.id || fallbackId,
    name: pl.name || '',
    cover: pl.coverImgUrl || pl.cover || '',
    trackCount: pl.trackCount || pl.track_count || 0,
    playCount: pl.playCount || pl.play_count || 0,
    creator: (pl.creator && pl.creator.nickname) || pl.creatorNickname || '',
    subscribed: !!pl.subscribed,
    specialType: pl.specialType || 0,
  };
}

function mapPodcastRadio(r) {
  r = r || {};
  const dj = r.dj || r.djSimple || r.djUser || r.creator || {};
  const id = r.id || r.rid || r.radioId;
  return {
    id,
    rid: id,
    name: r.name || r.radioName || '',
    cover: r.picUrl || r.picURL || r.coverUrl || r.coverImgUrl || r.avatarUrl || '',
    desc: r.desc || r.description || r.rcmdText || '',
    djName: dj.nickname || r.djName || r.nickname || '',
    category: r.category || r.categoryName || '',
    programCount: r.programCount || r.programNum || r.programCnt || 0,
    subCount: r.subCount || r.subedCount || r.subscriberCount || 0,
  };
}

function podcastCollectionMeta(key, items) {
  const meta = {
    collect: { key: 'collect', title: '收藏播客', sub: '你收藏的播客', itemType: 'radio' },
    created: { key: 'created', title: '创建播客', sub: '你创建的播客', itemType: 'radio' },
    liked: { key: 'liked', title: '喜欢的声音', sub: '收藏或最近喜欢的声音', itemType: 'voice' },
  }[key] || { key, title: key, sub: '', itemType: 'radio' };
  const first = (items || [])[0] || {};
  return { ...meta, count: (items || []).length, cover: first.cover || first.picUrl || first.coverUrl || '' };
}

// ---------------------------------------------------------------- VIP / login info (ported, minus vip_info_v2 enrichment: not in XEAPI allowlist)

function firstPositiveNumberFrom(objects, keys) {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of keys) {
      const value = Number(obj[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return 0;
}

function collectStringValues(value, out, depth) {
  if (depth > 4 || value == null) return out;
  if (typeof value === 'string') { if (value) out.push(value); return out; }
  if (Array.isArray(value)) { value.forEach(item => collectStringValues(item, out, depth + 1)); return out; }
  if (typeof value === 'object') Object.keys(value).forEach(key => collectStringValues(value[key], out, depth + 1));
  return out;
}

function collectVipStringValues(value, out, depth) {
  if (depth > 4 || value == null) return out;
  if (Array.isArray(value)) { value.forEach(item => collectVipStringValues(item, out, depth + 1)); return out; }
  if (typeof value !== 'object') return out;
  Object.keys(value).forEach(key => {
    const child = value[key];
    if (/vip|svip|member|associator|privilege|right|level|package|label|title|type/i.test(key)) {
      collectStringValues(child, out, depth + 1);
    } else if (child && typeof child === 'object') {
      collectVipStringValues(child, out, depth + 1);
    }
  });
  return out;
}

function activeNeteaseVipPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return false;
  const expire = Number(pkg.expireTime || pkg.expire_time || pkg.expire || pkg.endTime || 0) || 0;
  if (expire && expire < Date.now()) return false;
  return firstPositiveNumberFrom([pkg], ['vipLevel', 'vip_level', 'level', 'vipType', 'vip_type', 'vipCode', 'vip_code', 'status']) > 0;
}

function normalizeNeteaseVip(profile, account, extra) {
  profile = profile || {}; account = account || {}; extra = extra || {};
  const vipInfo = profile.vipInfo || profile.vipinfo || account.vipInfo || account.vipinfo || extra.vipInfo || extra.vipinfo || {};
  const vipExtra = extra.vipExtra || extra.vip_info || extra.vipInfoV2 || {};
  const vipData = vipExtra.data || vipExtra;
  const objects = [account, profile, vipInfo, extra, vipData];
  const vipType = firstPositiveNumberFrom(objects, [
    'vipType', 'vip_type', 'viptype', 'musicVipType', 'music_vip_type',
    'musicVipLevel', 'music_vip_level', 'redVipLevel', 'red_vip_level',
    'blackVipLevel', 'black_vip_level', 'luxuryVipLevel', 'luxury_vip_level',
  ]);
  const text = collectVipStringValues({ account, profile, vipInfo, extra, vipData }, [], 0).join(' ').toLowerCase();
  const redplus = vipData.redplus || vipData.redPlus || vipInfo.redplus || vipInfo.redPlus || extra.redplus || extra.redPlus;
  const associator = vipData.associator || vipInfo.associator || extra.associator;
  const musicPackage = vipData.musicPackage || vipData.music_package || vipInfo.musicPackage || vipInfo.music_package || extra.musicPackage || extra.music_package;
  const svipType = firstPositiveNumberFrom(objects, ['svipType', 'svip_type', 'superVipLevel', 'super_vip_level', 'superVipType', 'super_vip_type']);
  const svipFlag = objects.some(obj => obj && (
    obj.isSvip === true || obj.is_svip === true || obj.svip === true ||
    Number(obj.isSvip || obj.is_svip || obj.svip || obj.svipType || obj.svip_type || obj.superVipLevel || obj.super_vip_level || 0) > 0
  )) || /svip|supervip|super_vip|黑胶svip|超级会员/.test(text);
  const vipFlag = objects.some(obj => obj && (
    obj.isVip === true || obj.is_vip === true || obj.vip === true ||
    Number(obj.isVip || obj.is_vip || obj.vip || obj.vipFlag || obj.vipflag || 0) > 0
  )) || /vip|黑胶|会员/.test(text);
  const svipResolved = svipFlag || svipType > 0 || activeNeteaseVipPackage(redplus);
  const vipResolved = vipFlag || activeNeteaseVipPackage(associator) || activeNeteaseVipPackage(musicPackage);
  const isSvip = svipResolved;
  const isVip = isSvip || vipResolved || vipType > 0;
  const vipLevel = isSvip ? 'svip' : (isVip ? 'vip' : 'none');
  return { vipType, vipLevel, isVip, isSvip, vipLabel: vipLevel === 'svip' ? 'SVIP' : (vipLevel === 'vip' ? 'VIP' : '无VIP') };
}

function normalizeLoginInfo(profile, account, extra) {
  profile = profile || {}; account = account || {};
  const userId = profile.userId || profile.user_id || profile.id || account.userId || account.id || '';
  if (!(userId || userId === 0)) return { loggedIn: false };
  const vip = normalizeNeteaseVip(profile, account, extra);
  return {
    loggedIn: true,
    userId,
    nickname: profile.nickname || profile.userName || '网易云用户',
    avatar: profile.avatarUrl || profile.avatar || '',
    ...vip,
  };
}

function notLoggedInfo(extra = {}) {
  return { loggedIn: false, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP', ...extra };
}

function isAuthInvalidPayload(payload) {
  const body = (payload && (payload.body || payload)) || {};
  const code = Number(body.code || 0);
  if (code === 301 || code === 401) return true;
  const msg = String(body.message || body.msg || '');
  return /未登录|需要登录|请先登录/.test(msg) && code >= 300;
}

const loginInfoCache = new Map(); // hash(cookie) -> {at, info}; isolate-local, 25s TTL (upstream: 30s)

async function getLoginInfo(cookieStr, { fresh = false } = {}) {
  if (!cookieStr) return notLoggedInfo();
  const key = hashString(cookieStr);
  const cached = loginInfoCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < 25000) return cached.value;
  let info = null;
  try {
    const st = await xeapi('/login/status', {}, cookieStr, 6000);
    const body = st.body || {};
    const data = body.data || body;
    const parsed = normalizeLoginInfo(data.profile || body.profile, data.account || body.account, data);
    if (parsed.loggedIn) info = parsed;
  } catch (_) {}
  if (!info) {
    try {
      const acc = await xeapi('/user/account', {}, cookieStr, 6000);
      const body = acc.body || {};
      const parsed = normalizeLoginInfo(body.profile, body.account, body);
      if (parsed.loggedIn) info = parsed;
      else if (isAuthInvalidPayload(acc.body)) info = notLoggedInfo({ hasCookie: true, authInvalid: true });
    } catch (_) {}
  }
  if (!info) info = notLoggedInfo({ hasCookie: true });
  loginInfoCache.set(key, { at: Date.now(), info });
  return info;
}

async function requireLogin(request) {
  const cookieStr = readSession(request);
  const info = await getLoginInfo(cookieStr);
  if (!info.loggedIn || !info.userId) return null;
  return { info, cookieStr };
}

// ---------------------------------------------------------------- site auth (music download gate)
//
// 下载页专用：验本站 Supabase 登录凭证（Authorization: Bearer <access_token>）。
// 只认 /auth/v1/user 返回 200 且带 id 的 token；不验签名以外的任何本站权限，
// 注册即入班的本站账号都算通过。失败返回 null，由调用方回 401。
async function requireSiteAuth(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status !== 200) return null;
    const user = await res.json();
    if (!user || !user.id) return null;
    return { id: user.id, email: user.email || '' };
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------- search

async function handleSearch(keywords, limit, offset, cookieStr) {
limit = Math.max(1, Math.min(50, Number(limit) || 20));
offset = Math.max(0, Number(offset) || 0);
const result = await xeapi('/cloudsearch', { keywords, limit, offset}, cookieStr);
const body = result.body || {};
const songs = (body.result && body.result.songs) || [];
let mapped = songs.map(mapSongRecord);
const missing = mapped.filter(s =>!s.cover).map(s => s.id).filter(Boolean);
if (missing.length) {
try {
const dd = await xeapi('/song/detail', { ids: missing.join(',')}, cookieStr);
const songsArr = (dd.body && dd.body.songs) || [];
const idToPic = {};
songsArr.forEach(s => {
const pic = (s.al && s.al.picUrl) || (s.album && s.album.picUrl) || '';
if (pic) idToPic[s.id] = pic;
});
mapped = mapped.map(s => s.cover? s: {...s, cover: idToPic[s.id] || ''});
} catch (_) {}
}
return mapped;
}

// ---------------------------------------------------------------- song url (ported, budgeted for Workers)

const NETEASE_QUALITY_CANDIDATES = [
{ level: 'jymaster', br: 1999000, label: '超清母带', svip: true},
{ level: 'hires', br: 1999000, label: '高清臻音'},
{ level: 'lossless', br: 1411000, label: '无损'},
{ level: 'exhigh', br: 999000, label: '极高'},
{ level: 'standard', br: 128000, label: '标准'},
];

function normalizeQualityPreference(value) {
const raw = String(value || '').toLowerCase().trim();
if (['jymaster', 'master', 'studio', 'svip'].includes(raw)) return 'jymaster';
if (['hires', 'hi-res', 'highres', 'zhenyin', 'spatial'].includes(raw)) return 'hires';
if (['lossless', 'flac', 'sq'].includes(raw)) return 'lossless';
if (['exhigh', 'high', '320', '320k', 'hq'].includes(raw)) return 'exhigh';
if (['standard', 'normal', '128', '128k', 'std'].includes(raw)) return 'standard';
return 'hires';
}

function qualityCandidatesFrom(target, candidates) {
target = normalizeQualityPreference(target);
let start = candidates.findIndex(item => item.level === target);
if (start < 0) start = 0;
return candidates.slice(start);
}

function playbackRestriction(provider, category, message, action, extra) {
return { provider, category, action: action || '', message,...(extra || {})};
}

function classifyNeteasePlaybackRestriction(lastData, loginInfo) {
const loggedIn =!!(loginInfo && loginInfo.loggedIn);
const vipReady =!!(loginInfo && (loginInfo.isVip || loginInfo.isSvip || loginInfo.vipLevel === 'vip' || loginInfo.vipLevel === 'svip' || Number(loginInfo.vipType || 0) > 0));
const fee = Number(lastData && lastData.fee);
const code = Number(lastData && lastData.code);
const freeTrial = lastData && lastData.freeTrialInfo;
if (freeTrial) return playbackRestriction('netease', 'trial_only', '网易云仅返回试听片段，完整播放需要会员或购买', 'upgrade', { code, fee});
// radio-web 二期修复: 上游明确 404/403 (无地址、无试听) 是「这首歌拿不到」而非「未登录」——
// 实测游客态下大量曲目 (屋顶/晴天/稻香/麻雀等) 经 XEAPI 返回 code=404, 旧顺序先判
// !loggedIn 会把它们全误标 login_required, 触发渲染层自动弹登录框。404 判定必须在登录判定之前。
if (code === 404 || code === 403) return playbackRestriction('netease', 'copyright_unavailable', '网易云没有返回这首歌的播放地址，多为版权下架或地区限制', 'switch_source', { code, fee});
if (!loggedIn) return playbackRestriction('netease', 'login_required', '网易云需要登录后尝试获取完整播放地址', 'login', { code, fee});
if (fee === 1) {
if (vipReady) return playbackRestriction('netease', 'copyright_unavailable', '当前会员状态下仍未取得可播放地址，已尝试在网易云内匹配同一录音版本', 'switch_source', { code, fee});
return playbackRestriction('netease', 'vip_required', '网易云歌曲需要 VIP 权限，当前无法获取完整播放地址', 'upgrade', { code, fee});
}
if (fee === 4) return playbackRestriction('netease', 'paid_required', '网易云歌曲需要单曲、专辑购买或更高权限', 'purchase', { code, fee});
if (fee === 8) return playbackRestriction('netease', 'copyright_unavailable', '当前网易云版本没有返回完整音源，已尝试匹配站内同一录音版本', 'switch_source', { code, fee});
return playbackRestriction('netease', 'url_unavailable', '网易云没有返回可播放地址，可能是版权、会员或地区限制', loggedIn? 'switch_source': 'login', { code, fee});
}

function audioProbeMagic(bytes) {
if (!bytes ||!bytes.length) return '';
const ascii = (from, to) => { try { return new TextDecoder('ascii').decode(bytes.subarray(from, to));} catch (_) { return '';}};
if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'mp3-id3';
if (bytes.length >= 4 && ascii(0, 4) === 'fLaC') return 'flac';
if (bytes.length >= 4 && ascii(0, 4) === 'OggS') return 'ogg';
if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wave';
if (bytes.length >= 12 && ascii(4, 8) === 'ftyp') return 'mp4';
const scan = Math.min(bytes.length - 1, 2048);
for (let i = 0; i < scan; i++) {
if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) return 'mpeg-frame';
}
return '';
}

// 轻量探测: 只读前 8KB 判断是否为真实音频 (与上游 probePlaybackAudioUrl 同判定: >=512B + magic + 非文本类型)
async function probePlaybackAudioUrl(audioUrl, timeoutMs = 2500) {
try {
const resp = await fetch(audioUrl, {
headers: { 'user-agent': UA, referer: 'https://music.163.com/', range: 'bytes=0-8191'},
signal: AbortSignal.timeout(timeoutMs),
});
const status = resp.status;
const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
let sample = new Uint8Array(0);
if (resp.body && (status === 200 || status === 206)) {
const reader = resp.body.getReader();
const chunks = [];
let bytes = 0;
try {
while (bytes < 8192) {
const chunk = await reader.read();
if (chunk.done) break;
chunks.push(chunk.value);
bytes += chunk.value.length;
}
} finally {
try { await reader.cancel();} catch (_) {}
}
sample = new Uint8Array(bytes);
let at = 0;
for (const c of chunks) { sample.set(c, at); at += c.length;}
} else if (resp.body) {
try { await resp.body.cancel();} catch (_) {}
}
const magic = audioProbeMagic(sample);
const contentLooksText = /text\/html|application\/(json|xml)|text\/plain/.test(contentType);
return { ok: (status === 200 || status === 206) && sample.length >= 512 &&!contentLooksText &&!!magic, status, bytes: sample.length, magic};
} catch (err) {
return { ok: false, status: 0, reason: err && err.name === 'TimeoutError'? 'timeout': 'network'};
}
}

async function resolveNeteaseDirectSongUrl(id, loginInfo, qualityPreference, cookieStr) {
const requestedQuality = normalizeQualityPreference(qualityPreference);
const svipReady =!!(loginInfo && loginInfo.loggedIn && (loginInfo.vipLevel === 'svip' || loginInfo.isSvip));
const qualities = qualityCandidatesFrom(requestedQuality, NETEASE_QUALITY_CANDIDATES)
.filter(q =>!q.svip || svipReady)
.slice(0, 3); // Workers 预算: 最多试 3 档 (上游桌面版试全部 5 档)
let trialFallback = null;
let lastData = null;
let lastError = null;
const probeFailures = [];
for (const q of qualities) {
try {
const result = await xeapi('/song/url/v1', { id, level: q.level}, cookieStr, 6000);
const d = result.body && result.body.data && result.body.data[0];
if (d) lastData = d;
// radio-web 二期修复: 上游对该曲明确返回 404 (无 url、无试听信息) 时, 其余音质档
// 实测均为同一 404 (standard/exhigh/hires 已逐档核验), 不再逐档重试, 直接进同曲匹配,
// 把单曲解析耗时从约 5-11 秒压下来。
if (d && Number(d.code) === 404 && !d.url && !d.freeTrialInfo) break;
const url = d && d.url;
const freeTrial = d && d.freeTrialInfo;
let probe = null;
if (url) {
probe = await probePlaybackAudioUrl(url);
if (!probe.ok) { probeFailures.push(q.level + ':' + (probe.status || probe.reason || 'invalid-audio')); continue;}
}
if (url &&!freeTrial && probe && probe.ok) {
return { provider: 'netease', source: 'netease', url, trial: false, playable: true, level: q.level, quality: q.label, br: d.br, requestedQuality, probeStatus: probe.status, probeBytes: probe.bytes, probeMagic: probe.magic};
}
if (url && freeTrial && probe && probe.ok &&!trialFallback) {
trialFallback = { provider: 'netease', source: 'netease', url, trial: true, playable: true, level: q.level, quality: q.label, br: d.br, requestedQuality, trialInfo: freeTrial, restriction: classifyNeteasePlaybackRestriction(d, loginInfo), probeStatus: probe.status, probeBytes: probe.bytes, probeMagic: probe.magic};
}
} catch (err) {
lastError = err;
}
}
if (trialFallback) return trialFallback;
const restriction = classifyNeteasePlaybackRestriction(lastData, loginInfo);
return {
provider: 'netease', source: 'netease', url: null, trial: false, playable: false,
reason: restriction.category, message: restriction.message, restriction,
lastCode: lastData && lastData.code, fee: lastData && lastData.fee,
error: lastError && lastError.message, probeFailures: probeFailures.slice(0, 12), requestedQuality,
};
}

// 同曲匹配 (简化版): cloudsearch 候选 + 名称/歌手/时长打分; 上游还有指纹与官方推荐通道, 一期从略
function matchText(value) {
return String(value || '').normalize('NFKC').toLowerCase()
.replace(/[（(\]]*[）)】\]]/g, '')
.replace(/[\s·・\-—_.,，。:：'"“”‘’/\\|!?！？]+/g, '');
}

async function resolveNeteaseSameTrackPlayback(id, loginInfo, qualityPreference, hints, cookieStr) {
const name = String(hints.name || '').trim();
const artist = String(hints.artist || '').trim();
if (!name ||!artist) return null;
const excluded = new Set(String(hints.excludeIds || '').split(',').map(v => v.trim()).filter(Boolean));
excluded.add(String(id || ''));
let rawSongs = [];
try {
const r = await xeapi('/cloudsearch', { keywords: `${name} ${artist}`, limit: 12, offset: 0}, cookieStr, 6000);
rawSongs = (r.body && r.body.result && r.body.result.songs) || [];
} catch (_) { return null;}
const wantName = matchText(name);
const wantArtists = new Set(artist.split(/[/、,，&]/).map(matchText).filter(Boolean));
const wantDuration = Number(hints.duration) || 0;
const candidates = [];
for (const raw of rawSongs) {
const song = mapSongRecord(raw);
if (!song.id || excluded.has(String(song.id))) continue;
let score = 0;
if (matchText(song.name) === wantName) score += 50;
else if (matchText(song.name).includes(wantName) || wantName.includes(matchText(song.name))) score += 20;
const candArtists = new Set(String(song.artist || '').split(' / ').map(matchText).filter(Boolean));
let artistHit = 0;
wantArtists.forEach(a => { if (candArtists.has(a)) artistHit += 1;});
score += artistHit * 25;
const candDuration = Number(song.duration) || 0;
if (wantDuration && candDuration) {
const diff = Math.abs(candDuration - (wantDuration < 10000? wantDuration * 1000: wantDuration));
if (diff <= 3000) score += 15; else if (diff <= 8000) score += 5; else score -= 10;
}
if (score >= 70) candidates.push({ song, score});
}
candidates.sort((a, b) => b.score - a.score);
const triedIds = [...excluded];
for (const candidate of candidates.slice(0, 3)) {
triedIds.push(String(candidate.song.id));
try {
const playback = await resolveNeteaseDirectSongUrl(candidate.song.id, loginInfo, qualityPreference, cookieStr);
if (playback && playback.url &&!playback.trial) {
return { candidate: {...candidate, fingerprintMatches: 0, officialRecommendation: false}, playback, triedIds};
}
} catch (_) {}
}
return null;
}

async function handleSongUrl(id, loginInfo, qualityPreference, matchHints, cookieStr) {
const hints = matchHints || {};
let direct = null;
if (!hints.skipDirect) {
direct = await resolveNeteaseDirectSongUrl(id, loginInfo, qualityPreference, cookieStr);
} else {
const restriction = playbackRestriction('netease', 'url_unavailable', '正在继续尝试网易云站内的其它同曲版本', 'retry', { code: 'NETEASE_DIRECT_SKIPPED_AFTER_MATCH_FAILURE'});
direct = { provider: 'netease', source: 'netease', url: null, trial: false, playable: false, reason: restriction.category, message: restriction.message, restriction, error: 'NETEASE_DIRECT_SKIPPED_AFTER_MATCH_FAILURE'};
}
if (direct && direct.url &&!direct.trial) return direct;
const sourceMatchAttempted =!!(String(hints.name || '').trim() && String(hints.artist || '').trim());
const matched = await resolveNeteaseSameTrackPlayback(id, loginInfo, qualityPreference, hints, cookieStr);
if (!matched) return {...direct, sourceMatchAttempted};
return {
...matched.playback,
provider: 'netease',
source: 'netease-same-track',
sourceMatch: true,
matchKind: 'netease_same_track_metadata',
matchedFromId: String(id || ''),
requestedSongId: String(id || ''),
resolvedNeteaseId: String(matched.candidate.song.id || ''),
resolvedSongId: String(matched.candidate.song.id || ''),
matchedSong: matched.candidate.song,
matchScore: Math.round(matched.candidate.score || 0),
fingerprintMatches: 0,
sourceMatchTriedIds: matched.triedIds || [String(matched.candidate.song.id || '')],
originalRestriction: (direct && direct.restriction) || null,
};
}

// ---------------------------------------------------------------- playlists

async function fetchPlaylistDetailMeta(id, cookieStr) {
const detail = await xeapi('/playlist/detail', { id, s: 0}, cookieStr);
const pl = (detail.body && detail.body.playlist) || {};
return { playlistMeta: mapNeteasePlaylistMeta(pl, id), tracks: Array.isArray(pl.tracks)? pl.tracks: [], trackIds: Array.isArray(pl.trackIds)? pl.trackIds.map(t => t && (t.id || t.songId || t.trackId)).filter(Boolean): []};
}

async function fetchNeteasePlaylistTracksPage(id, limit, offset, cookieStr) {
limit = Math.max(1, Math.min(200, parseInt(limit || '48', 10) || 48));
offset = Math.max(0, parseInt(offset || '0', 10) || 0);
let rawTracks = [];
let playlistMeta = { id, name: '', cover: '', trackCount: 0};
let total = 0;
let requestedCount = 0;
try {
const index = await fetchPlaylistDetailMeta(id, cookieStr);
if (index.trackIds && index.trackIds.length) {
playlistMeta = index.playlistMeta || playlistMeta;
total = index.trackIds.length;
const pageIds = index.trackIds.slice(offset, offset + limit);
requestedCount = pageIds.length;
if (pageIds.length) {
const detail = await xeapi('/song/detail', { ids: pageIds.join(',')}, cookieStr);
const rows = (detail.body && (detail.body.songs || detail.body.tracks)) || [];
const byId = new Map(rows.map(track => [String(track && track.id || ''), track]));
rawTracks = pageIds.map(trackId => byId.get(String(trackId))).filter(Boolean);
}
}
} catch (_) {}
if (!requestedCount &&!rawTracks.length) {
try {
const page = await xeapi('/playlist/track/all', { id, limit, offset}, cookieStr);
const body = page.body || {};
rawTracks = body.songs || body.tracks || [];
requestedCount = rawTracks.length;
total = Number(body.total || body.count || body.songCount || body.trackCount || 0) || 0;
} catch (_) {}
}
if (!rawTracks.length &&!requestedCount) {
try {
const detail = await fetchPlaylistDetailMeta(id, cookieStr);
playlistMeta = detail.playlistMeta || playlistMeta;
total = Math.max(total, Number(playlistMeta.trackCount || 0) || 0);
rawTracks = (detail.tracks || []).slice(offset, offset + limit);
} catch (_) {}
}
if (!playlistMeta.trackCount && total) playlistMeta.trackCount = total;
const nextOffset = offset + Math.max(requestedCount, rawTracks.length);
return { playlistMeta, rawTracks, total, offset, limit, nextOffset, hasMore: total? nextOffset < total: rawTracks.length >= limit};
}

async function fetchAllNeteasePlaylistTracks(id, cookieStr) {
let playlistMeta = { id, name: '', cover: '', trackCount: 0};
let detailTracks = [];
try {
const detail = await fetchPlaylistDetailMeta(id, cookieStr);
playlistMeta = detail.playlistMeta || playlistMeta;
detailTracks = detail.tracks || [];
} catch (_) {}
const rawTracks = [];
const seen = new Set();
const expectedTotal = Number(playlistMeta.trackCount || 0) || 0;
let offset = 0;
for (let page = 0; page < 20; page += 1) {
try {
const all = await xeapi('/playlist/track/all', { id, limit: 500, offset}, cookieStr, 12000);
const body = all.body || {};
const rows = body.songs || body.tracks || [];
let added = 0;
for (const track of rows) {
const key = String(track && track.id || '');
if (!key || seen.has(key)) continue;
seen.add(key);
rawTracks.push(track);
added += 1;
}
if (!rows.length ||!added) break;
if (expectedTotal && rawTracks.length >= expectedTotal) break;
if (!expectedTotal && rows.length < 500) break;
offset += 500;
} catch (_) { break;}
}
if (!rawTracks.length && detailTracks.length) rawTracks.push(...detailTracks);
return { playlistMeta, rawTracks};
}

async function fetchNeteaseUserPlaylistsPage(uid, limit, offset, cookieStr) {
limit = Math.max(1, Math.min(200, parseInt(limit || '48', 10) || 48));
offset = Math.max(0, parseInt(offset || '0', 10) || 0);
const r = await xeapi('/user/playlist', { uid, limit, offset}, cookieStr);
const body = r.body || {};
const playlists = Array.isArray(body.playlist)? body.playlist: [];
const total = Math.max(Number(body.total || body.count || 0) || 0, offset + playlists.length);
const nextOffset = offset + playlists.length;
return { playlists, total, offset, limit, nextOffset, hasMore: total? nextOffset < total: playlists.length >= limit};
}

async function fetchAllNeteaseUserPlaylists(uid, maxItems, cookieStr) {
const playlists = [];
const seen = new Set();
let offset = 0;
for (let page = 0; page < 20; page += 1) {
const r = await xeapi('/user/playlist', { uid, limit: 200, offset}, cookieStr);
const body = r.body || {};
const raw = Array.isArray(body.playlist)? body.playlist: [];
for (const pl of raw) {
const pid = String(pl && pl.id || '').trim();
if (!pid || seen.has(pid)) continue;
seen.add(pid);
playlists.push(pl);
}
if (maxItems && playlists.length >= maxItems) break;
if (!raw.length || raw.length < 200) break;
offset += 200;
}
return maxItems? playlists.slice(0, maxItems): playlists;
}

// ---------------------------------------------------------------- discover home

async function handleDiscoverHome(cookieStr) {
const info = await getLoginInfo(cookieStr);
const loggedIn =!!(info && info.loggedIn);
if (!loggedIn) {
return { loggedIn: false, user: null, dailySongs: [], dailySongTotal: 0, dailySongsComplete: true, playlists: [], podcasts: [], mode: 'starter', updatedAt: Date.now()};
}
const settle = p => p.then(v => ({ ok: true, v})).catch(() => ({ ok: false, v: null}));
const [pers, resource, songs] = await Promise.all([
settle(xeapi('/personalized', { limit: 8}, cookieStr)),
settle(xeapi('/recommend/resource', {}, cookieStr)),
settle(xeapi('/recommend/songs', {}, cookieStr)),
]);
const personalizedBody = (pers.ok && pers.v && pers.v.body) || {};
const publicPlaylists = (personalizedBody.result || personalizedBody.data || [])
.map(pl => mapDiscoverPlaylist(pl, '推荐歌单')).filter(pl => pl.id && pl.name).slice(0, 8);
let privatePlaylists = [];
if (resource.ok && resource.v) {
const body = resource.v.body || {};
const raw = body.recommend || body.data || [];
privatePlaylists = (Array.isArray(raw)? raw: []).map(pl => mapDiscoverPlaylist(pl, '私人推荐')).filter(pl => pl.id && pl.name).slice(0, 6);
}
let dailySongs = [];
if (songs.ok && songs.v) {
const body = songs.v.body || {};
const raw = (body.data && (body.data.dailySongs || body.data.recommend)) || body.recommend || [];
dailySongs = (Array.isArray(raw)? raw: []).map(mapSongRecord).filter(song => song && song.id && song.name);
}
return {
loggedIn,
user: { userId: info.userId, nickname: info.nickname || '', avatar: info.avatar || ''},
dailySongs,
dailySongTotal: dailySongs.length,
dailySongsComplete: true,
playlists: privatePlaylists.concat(publicPlaylists).slice(0, 10),
podcasts: [],
updatedAt: Date.now(),
};
}

// ---------------------------------------------------------------- lyric

function lyricNodeText(body, key) {
return body && body[key] && typeof body[key].lyric === 'string'? body[key].lyric: '';
}

async function handleLyric(id, cookieStr) {
// XEAPI 现网仅开放 /lyric/new (上游服务端还会并 /lyric 老接口合并, 一期以 new 为准)
const nr = await xeapi('/lyric/new', { id}, cookieStr);
const body = nr.body || {};
return {
lyric: lyricNodeText(body, 'lrc'),
tlyric: lyricNodeText(body, 'tlyric'),
yrc: lyricNodeText(body, 'yrc'),
ytlrc: lyricNodeText(body, 'ytlrc'),
romalrc: lyricNodeText(body, 'romalrc'),
yromalrc: lyricNodeText(body, 'yromalrc'),
source: 'lyric_new',
};
}

// ---------------------------------------------------------------- album

async function handleNeteaseAlbumDetail(id, limit, cookieStr) {
  const albumId = String(id || '').trim();
  const num = Math.max(10, Math.min(120, parseInt(limit || '80', 10) || 80));
  if (!albumId) return { provider: 'netease', error: 'MISSING_ALBUM_ID', album: null, songs: [] };
  const result = await xeapi('/album', { id: albumId }, cookieStr);
  const body = result.body || {};
  const info = body.album || (body.data && (body.data.album || body.data)) || {};
  const rawSongs = Array.isArray(body.songs) ? body.songs : (Array.isArray(info.songs) ? info.songs : []);
  const artists = mapArtists(info.artists || info.ar || []);
  const songs = rawSongs.slice(0, num).map(mapSongRecord).filter(song => song && song.id);
  return {
    provider: 'netease',
    album: {
      provider: 'netease',
      id: info.id || albumId,
      albumId: info.id || albumId,
      name: info.name || '',
      artist: artists.map(a => a.name).join(' / ') || (info.artist && info.artist.name) || (songs[0] && songs[0].artist) || '',
      artists,
      cover: info.picUrl || info.coverUrl || '',
      releaseDate: info.publishTime || info.publishTime === 0 ? info.publishTime : '',
      trackCount: Number(info.size || info.trackCount || rawSongs.length) || songs.length,
    },
    songs,
    total: Number(info.size || info.trackCount || rawSongs.length) || songs.length,
  };
}

function normalizeApiCode(payload) {
  const body = payload && (payload.body || payload);
  return Number((body && body.code) || (body && body.body && body.body.code) || (payload && payload.status) || 0);
}

// ---------------------------------------------------------------- media proxies

const COVER_HOST_SUFFIXES = ['126.net', '163.com', 'gtimg.cn', 'qq.com'];
const AUDIO_HOST_SUFFIXES = ['126.net', '127.net', '163.com'];

function hostAllowed(hostname, suffixes) {
  const host = String(hostname || '').toLowerCase();
  return suffixes.some(suffix => host === suffix || host.endsWith('.' + suffix));
}

function audioContentTypeForUrl(audioUrl, upstreamType) {
  let pathname = '';
  try { pathname = new URL(audioUrl).pathname.toLowerCase(); } catch (_) {}
  if (/\.flac$/.test(pathname)) return 'audio/flac';
  if (/\.mp3$/.test(pathname)) return 'audio/mpeg';
  if (/\.(m4a|mp4)$/.test(pathname)) return 'audio/mp4';
  if (/\.ogg$/.test(pathname)) return 'audio/ogg';
  if (/\.wav$/.test(pathname)) return 'audio/wav';
  return upstreamType || 'audio/mpeg';
}

async function handleCoverProxy(target) {
  if (!target || !/^https?:\/\//i.test(target)) return new Response('Invalid cover url', { status: 400, headers: { 'access-control-allow-origin': '*' } });
  let parsed;
  try { parsed = new URL(target); } catch (_) { return new Response('Invalid cover url', { status: 400 }); }
  if (!hostAllowed(parsed.hostname, COVER_HOST_SUFFIXES)) return new Response('Cover host not allowed', { status: 403 });
  const resp = await fetch(parsed.toString(), { headers: { 'user-agent': UA, referer: 'https://music.163.com/' } });
  const headers = {
    'content-type': resp.headers.get('content-type') || 'image/jpeg',
    'access-control-allow-origin': '*',
    'cross-origin-resource-policy': 'cross-origin',
    'cache-control': 'public, max-age=86400',
  };
  const cl = resp.headers.get('content-length');
  if (cl) headers['content-length'] = cl;
  return new Response(resp.body, { status: resp.status, headers });
}

async function handleAudioProxy(request, target) {
  if (!target) return new Response('Missing url', { status: 400 });
  if (target.includes('#auth=')) return new Response('Decrypted audio source is not available on web', { status: 400 });
  let parsed;
  try { parsed = new URL(target); } catch (_) { return new Response('Invalid audio url', { status: 400 }); }
  if (!/^https?:$/.test(parsed.protocol) || !hostAllowed(parsed.hostname, AUDIO_HOST_SUFFIXES)) {
    return new Response('Audio host not allowed', { status: 403 });
  }
  const headers = { 'user-agent': UA, referer: 'https://music.163.com/' };
  const range = request.headers.get('range');
  if (range) headers.range = range;
  const up = await fetch(parsed.toString(), { headers });
  const out = {
    'content-type': audioContentTypeForUrl(target, up.headers.get('content-type')),
    'access-control-allow-origin': '*',
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  };
  const cl = up.headers.get('content-length'); if (cl) out['content-length'] = cl;
  const cr = up.headers.get('content-range'); if (cr) out['content-range'] = cr;
  return new Response(up.body, { status: up.status, headers: out });
}

// ---------------------------------------------------------------- cut providers / stubs

function providerUnavailable(pn) {
  const provider = pn.startsWith('/api/qq/') || pn === '/api/qq' ? 'qq'
    : pn.startsWith('/api/kugou/') ? 'kugou'
    : pn.startsWith('/api/qishui/') ? 'qishui' : 'spotify';
  const base = { provider, error: 'PROVIDER_NOT_AVAILABLE_ON_WEB', message: '该音源暂未开放' };
  if (pn.endsWith('/search')) return json({ ...base, songs: [], podcasts: [] });
  if (pn.endsWith('/user/playlists')) return json({ ...base, loggedIn: false, playlists: [] });
  if (pn.endsWith('/playlist/tracks')) return json({ ...base, playlist: null, tracks: [] });
  if (pn.endsWith('/song/url')) return json({ ...base, url: null, trial: false, playable: false, reason: 'provider_unavailable' });
  if (pn.endsWith('/lyric')) return json({ ...base, lyric: '', tlyric: '', yrc: '' });
  if (pn.endsWith('/login/status') || pn.endsWith('/status')) return json({ ...base, loggedIn: false });
  if (pn.endsWith('/logout')) return json({ ok: true });
  if (pn.endsWith('/song/like/check')) return json({ ...base, loggedIn: false, liked: {}, ids: [] });
  if (pn.endsWith('/recommendations')) return json({ ...base, playlists: [], songs: [] });
  if (pn.endsWith('/feed')) return json({ ...base, songs: [], items: [] });
  return json(base);
}

// ---------------------------------------------------------------- API router

async function handleApi(request, url) {
  let pn = url.pathname;
  const q = url.searchParams;
  const cookieStr = readSession(request);

  // ---- music download gate: /api/dl/* 先验本站账号，再把路径改写回 /api/* ----
  // 只拦截 /api/dl 前缀；Mineradio 主站 /api/* 原样走下面各分支，不受影响。
  // 网易云 Cookie 逻辑不变：本站通过后仍需第二步网易云扫码登录。
  if (pn === '/api/dl' || pn.startsWith('/api/dl/')) {
    const site = await requireSiteAuth(request);
    if (!site) return json({ error: 'SITE_LOGIN_REQUIRED', siteLoggedIn: false }, 401);
    pn = '/api/' + pn.slice('/api/dl/'.length);
  }

  if (pn.startsWith('/api/qq/') || pn === '/api/qq' || pn.startsWith('/api/kugou/') || pn.startsWith('/api/qishui/') || pn.startsWith('/api/spotify/') || pn === '/api/spotify') {
    return providerUnavailable(pn);
  }

  // ---- stubs / platform ----
  if (pn === '/api/app/version') {
    return json({ name: 'mineradio', productName: 'Mineradio', version: APP_VERSION, update: { provider: 'web', configured: false, owner: '', repo: '', preview: false, manifestOverride: false } });
  }
  if (pn === '/api/platform/capabilities') {
    return json({
      netease: { playlists: true, likeRead: true, likeWrite: true, albumRead: true, albumCollect: true, commentsRead: false, commentsWrite: false, listenReport: false },
      qq: { playlists: false, likeRead: false, likeWrite: false, albumRead: false, albumCollect: false, commentsRead: false, commentsWrite: false, listenReport: false },
      kugou: { playlists: false, likeRead: false, likeWrite: false, albumRead: false, albumCollect: false, commentsRead: false, commentsWrite: false, listenReport: false },
      qishui: { playlists: false, likeRead: false, likeWrite: false, albumRead: false, albumCollect: false, commentsRead: false, commentsWrite: false, recentPlayReport: false, listenReport: false },
      spotify: { playlists: false, likeRead: false, likeWrite: false, albumRead: false, albumCollect: false, commentsRead: false, commentsWrite: false, listenReport: false },
    });
  }
  if (pn === '/api/update/latest') {
    return json({
      configured: false, preview: false, updateAvailable: false,
      currentVersion: APP_VERSION, latestVersion: APP_VERSION,
      release: { tagName: 'v' + APP_VERSION, name: 'Mineradio v' + APP_VERSION, version: APP_VERSION, htmlUrl: '', externalUrl: '', downloadPageUrl: '', downloadPages: [], downloadUrl: '', asset: null, patch: null, patchAvailable: false, summary: '网页版无需更新，刷新页面即为最新。', notes: '' },
      reason: 'WEB_EDITION',
    });
  }
  if (pn.startsWith('/api/update/download') || pn.startsWith('/api/update/patch')) {
    return json({ ok: false, externalOnly: true, error: 'UPDATE_EXTERNAL_ONLY', message: '网页版无需下载更新，刷新页面即可。' }, 410);
  }
  if (pn === '/api/beatmap/cache/status') {
    return json({ enabled: false, dir: '', drive: '', reason: 'WEB_MEMORY_ONLY', mode: 'memory-only' });
  }
  if (pn === '/api/beatmap/cache') {
    if (request.method === 'GET') return json({ ok: true, hit: false, key: q.get('key') || '' });
    return json({ ok: false, enabled: false, mode: 'memory-only', reason: 'WEB_MEMORY_ONLY' });
  }
  if (pn === '/api/cuefield/transition') return json({ ok: false, error: 'CUEFIELD_UNAVAILABLE_ON_WEB' });
  if (pn === '/api/cuefield/feedback') {
    if (request.method === 'GET') return json({ ok: true, stats: {} });
    return json({ ok: true, record: null });
  }
  if (pn === '/api/weather/radio') {
    return json({ ok: false, error: 'WEATHER_UNAVAILABLE_ON_WEB', weather: null, radio: { title: '天气电台', subtitle: '网页版暂未开放天气电台，可以先听今日推荐。', seedQueries: [], songs: [] } });
  }
  if (pn === '/api/weather/ip-location') return json({ ok: false, error: 'WEATHER_UNAVAILABLE_ON_WEB', location: null });
  if (pn === '/api/podcast/dj-beatmap') return json({ ok: false, error: 'DJ_ANALYSIS_UNAVAILABLE_ON_WEB' });

  // ---- media proxies ----
  if (pn === '/api/cover') {
    try { return await handleCoverProxy(q.get('url')); }
    catch (err) { return new Response('Cover proxy failed', { status: 502 }); }
  }
  if (pn === '/api/audio') {
    try { return await handleAudioProxy(request, q.get('url')); }
    catch (err) { return new Response('Audio proxy failed', { status: 502, headers: { 'cache-control': 'no-store' } }); }
  }

  // ---- auth ----
  if (pn === '/api/login/qr/key') {
    try {
      const r = await xeapi('/login/qr/key', {}, '');
      const key = r.body && r.body.data && r.body.data.unikey;
      return json({ key });
    } catch (err) { return json({ error: String(err && err.message || err) }, 500); }
  }
  if (pn === '/api/login/qr/create') {
    try {
      const r = await xeapi('/login/qr/create', { key: q.get('key') || '', qrimg: 'true' }, '');
      const d = (r.body && r.body.data) || {};
      return json({ img: d.qrimg, url: d.qrurl });
    } catch (err) { return json({ error: String(err && err.message || err) }, 500); }
  }
  if (pn === '/api/login/qr/check') {
    try {
      const r = await xeapi('/login/qr/check', { key: q.get('key') || '' }, '', 8000);
      const body = r.body || {};
      const code = Number(body.code || 0);
      const msg = body.message || '';
      if (code === 803) {
        const cookie = extractUpstreamCookie(r);
        let info = notLoggedInfo({ hasCookie: !!cookie });
        if (cookie) {
          loginInfoCache.delete(hashString(cookie));
          const fresh = await getLoginInfo(cookie, { fresh: true });
          if (fresh.loggedIn) info = fresh;
          else {
            const profile = body.profile || (body.data && body.data.profile) || {};
            const account = body.account || (body.data && body.data.account);
            const parsed = normalizeLoginInfo(profile, account, body.data || body);
            info = parsed.loggedIn ? parsed : { loggedIn: true, pendingProfile: true, nickname: body.nickname || profile.nickname || '网易云用户', avatar: body.avatarUrl || profile.avatarUrl || '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
          }
        }
        const headers = cookie ? { 'set-cookie': sessionSetCookie(cookie) } : {};
        return json({ code, message: msg, ...info, hasCookie: !!cookie }, 200, headers);
      }
      return json({ code, message: msg, nickname: body.nickname, avatar: body.avatarUrl });
    } catch (err) { return json({ error: String(err && err.message || err) }, 500); }
  }
  if (pn === '/api/login/status') {
    const info = await getLoginInfo(cookieStr);
    const headers = info.authInvalid ? { 'set-cookie': sessionClearCookie() } : {};
    const { authInvalid, ...rest } = info;
    return json(rest, 200, headers);
  }
  if (pn === '/api/login/cookie') {
    try {
      const body = await readRequestBody(request);
      const raw = body.cookie || body.data || body.text || '';
      const normalized = normalizeCookieHeader(raw);
      if (!parseCookieString(normalized).MUSIC_U) {
        return json({ loggedIn: false, error: 'INVALID_NETEASE_COOKIE', message: '网易云 cookie 缺少 MUSIC_U' }, 400);
      }
      const info = await getLoginInfo(normalized, { fresh: true });
      const finalInfo = info.loggedIn ? info : { loggedIn: true, pendingProfile: true, nickname: '网易云用户', avatar: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
      return json({ ...finalInfo, saved: true, hasCookie: true }, 200, { 'set-cookie': sessionSetCookie(normalized) });
    } catch (err) { return json({ loggedIn: false, error: String(err && err.message || err) }, 500); }
  }
  if (pn === '/api/logout') {
    if (cookieStr) { try { await xeapi('/logout', {}, cookieStr, 5000); } catch (_) {} loginInfoCache.delete(hashString(cookieStr)); }
    return json({ ok: true }, 200, { 'set-cookie': sessionClearCookie() });
  }

  // ---- content ----
  if (pn === '/api/search') {
    try {
      const kw = q.get('keywords') || '';
      const limit = Math.max(1, Math.min(50, parseInt(q.get('limit') || '20', 10) || 20));
      const offset = Math.max(0, parseInt(q.get('offset') || '0', 10) || 0);
      const songs = await handleSearch(kw, limit, offset, cookieStr);
      return json({ songs, offset, limit, nextOffset: offset + songs.length, hasMore: songs.length >= limit });
    } catch (err) { return json({ error: String(err && err.message || err), songs: [] }, 500); }
  }

  if (pn === '/api/song/url') {
    try {
      const id = q.get('id');
      const quality = q.get('quality') || '';
      const hints = {
        name: q.get('name') || '', artist: q.get('artist') || '',
        artistId: q.get('artistId') || '', artistIds: q.get('artistIds') || '', artistNames: q.get('artistNames') || '',
        album: q.get('album') || '', duration: q.get('duration') || '',
        excludeIds: q.get('excludeIds') || '', skipDirect: q.get('skipDirect') === '1',
      };
      const loginInfo = cookieStr ? await getLoginInfo(cookieStr) : notLoggedInfo();
      const info = await handleSongUrl(id, loginInfo, quality, hints, cookieStr);
      return json({
        ...info,
        loggedIn: !!loginInfo.loggedIn,
        vipType: loginInfo.vipType || 0,
        vipLevel: loginInfo.vipLevel || 'none',
        isVip: !!loginInfo.isVip,
        isSvip: !!loginInfo.isSvip,
        vipLabel: loginInfo.vipLabel || '无VIP',
      });
    } catch (err) { return json({ error: String(err && err.message || err) }, 500); }
  }

  if (pn === '/api/lyric') {
    try {
      const id = q.get('id');
      if (!id) return json({ error: 'Missing song id', lyric: '' }, 400);
      return json(await handleLyric(id, cookieStr));
    } catch (err) { return json({ error: String(err && err.message || err), lyric: '' }, 500); }
  }

  if (pn === '/api/discover/home') {
    try { return json(await handleDiscoverHome(cookieStr)); }
    catch (err) { return json({ error: String(err && err.message || err), loggedIn: false, dailySongs: [], playlists: [], podcasts: [] }, 500); }
  }

  if (pn === '/api/user/playlists') {
    try {
      const info = await getLoginInfo(cookieStr);
      if (!info.loggedIn || !info.userId) return json({ loggedIn: false, playlists: [] });
      const requestedLimit = Math.max(0, parseInt(q.get('limit') || '0', 10) || 0);
      const requestedOffset = Math.max(0, parseInt(q.get('offset') || '0', 10) || 0);
      if (requestedLimit || requestedOffset || q.has('paged')) {
        const pageData = await fetchNeteaseUserPlaylistsPage(info.userId, requestedLimit || 48, requestedOffset, cookieStr);
        return json({
          loggedIn: true, userId: info.userId,
          playlists: pageData.playlists.map(pl => mapNeteasePlaylistMeta(pl, pl && pl.id)),
          total: pageData.total, offset: pageData.offset, limit: pageData.limit,
          nextOffset: pageData.nextOffset, hasMore: pageData.hasMore, partial: true,
        });
      }
      const rawPlaylists = await fetchAllNeteaseUserPlaylists(info.userId, requestedLimit, cookieStr);
      return json({ loggedIn: true, userId: info.userId, playlists: rawPlaylists.map(pl => mapNeteasePlaylistMeta(pl, pl && pl.id)) });
    } catch (err) { return json({ error: String(err && err.message || err), loggedIn: false, playlists: [] }, 500); }
  }

  if (pn === '/api/playlist/tracks') {
    try {
      const id = q.get('id');
      if (!id) return json({ error: 'Missing playlist id', tracks: [] }, 400);
      const pageLimit = parseInt(q.get('limit') || '0', 10) || 0;
      const pageOffset = parseInt(q.get('offset') || '0', 10) || 0;
      if (pageLimit || pageOffset) {
        const pageData = await fetchNeteasePlaylistTracksPage(id, pageLimit || 48, pageOffset, cookieStr);
        return json({
          playlist: pageData.playlistMeta || { id, name: '', cover: '', trackCount: 0 },
          tracks: (pageData.rawTracks || []).map(mapSongRecord).filter(t => t.id),
          offset: pageData.offset, limit: pageData.limit, nextOffset: pageData.nextOffset,
          hasMore: pageData.hasMore, total: pageData.total || Number(pageData.playlistMeta && pageData.playlistMeta.trackCount) || 0, partial: true,
        });
      }
      const synced = await fetchAllNeteasePlaylistTracks(id, cookieStr);
      const meta = synced.playlistMeta || { id, name: '', cover: '', trackCount: 0 };
      const tracks = (synced.rawTracks || []).map(mapSongRecord).filter(t => t.id);
      if (!meta.trackCount) meta.trackCount = tracks.length;
      return json({ playlist: meta, tracks });
    } catch (err) { return json({ error: String(err && err.message || err), tracks: [] }, 500); }
  }

  if (pn === '/api/album/detail') {
    try {
      const id = q.get('id') || q.get('albumId') || '';
      const limit = Math.max(10, Math.min(120, parseInt(q.get('limit') || '80', 10) || 80));
      if (!id) return json({ provider: 'netease', error: 'Missing album id', album: null, songs: [] }, 400);
      return json(await handleNeteaseAlbumDetail(id, limit, cookieStr));
    } catch (err) { return json({ provider: 'netease', error: String(err && err.message || err), album: null, songs: [] }, 500); }
  }

  if (pn === '/api/artist/detail') {
    try {
      const id = q.get('id');
      const limit = Math.max(10, Math.min(80, parseInt(q.get('limit') || '30', 10) || 30));
      if (!id) return json({ error: 'Missing artist id', songs: [] }, 400);
      let detailBody = {};
      try {
        const detail = await xeapi('/artist/detail', { id }, cookieStr);
        detailBody = detail.body || {};
      } catch (_) {}
      let rawSongs = [];
      try {
        const top = await xeapi('/artist/top/song', { id }, cookieStr);
        rawSongs = (top.body && top.body.songs) || [];
      } catch (_) {}
      const artist = detailBody.artist || (detailBody.data && (detailBody.data.artist || detailBody.data)) || {};
      const songs = rawSongs.map(mapSongRecord).filter(s => s.id).slice(0, limit);
      return json({
        id,
        artist: {
          id: artist.id || id,
          name: artist.name || artist.artistName || '',
          avatar: artist.avatar || artist.cover || artist.picUrl || artist.img1v1Url || '',
          brief: artist.briefDesc || artist.description || artist.desc || '',
          musicSize: artist.musicSize || artist.songSize || 0,
          albumSize: artist.albumSize || 0,
        },
        songs,
        body: detailBody,
      });
    } catch (err) { return json({ error: String(err && err.message || err), songs: [] }, 500); }
  }

  // ---- like / collect (login required) ----
  if (pn === '/api/song/like/check') {
    const auth = await requireLogin(request);
    if (!auth) return json({ error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    try {
      const ids = String(q.get('ids') || q.get('id') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length) return json({ error: 'Missing song id', liked: {}, ids: [] }, 400);
      // XEAPI 未开放 song_like_check, 用 likelist 全量比对 (与上游兜底路径一致)
      const r = await xeapi('/likelist', { uid: auth.info.userId }, auth.cookieStr);
      const likedIds = (((r.body || {}).ids) || []).map(String);
      const set = new Set(likedIds);
      const liked = {};
      ids.forEach(id => { liked[id] = set.has(String(id)); });
      return json({ loggedIn: true, ids, liked });
    } catch (err) { return json({ error: String(err && err.message || err) }, 500); }
  }

  if (pn === '/api/song/like') {
    const auth = await requireLogin(request);
    if (!auth) return json({ error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    try {
      const body = request.method === 'POST' ? await readRequestBody(request) : {};
      const id = body.id || q.get('id');
      const nextLike = String(body.like != null ? body.like : (q.get('like') || 'true')) !== 'false';
      if (!id) return json({ error: 'Missing song id' }, 400);
      const r = await xeapi('/like', { id, like: String(nextLike) }, auth.cookieStr);
      const code = (r.body && r.body.code) || 200;
      return json({ loggedIn: true, id, liked: nextLike, code, body: r.body || {} });
    } catch (err) { return json({ error: String(err && err.message || err) }, 500); }
  }

  if (pn === '/api/playlist/create') {
    const auth = await requireLogin(request);
    if (!auth) return json({ error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    // XEAPI 现网未开放 playlist_create 路由, 一期降级
    return json({ loggedIn: true, error: 'PLAYLIST_CREATE_UNAVAILABLE_ON_WEB', message: '网页版暂不支持新建网易云歌单', playlist: null });
  }

  if (pn === '/api/playlist/add-song') {
    const auth = await requireLogin(request);
    if (!auth) return json({ error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    try {
      const body = request.method === 'POST' ? await readRequestBody(request) : {};
      const pid = body.pid || q.get('pid');
      const id = body.id || body.ids || q.get('id') || q.get('ids');
      if (!pid || !id) return json({ error: 'Missing playlist id or song id' }, 400);
      const primary = await xeapi('/playlist/tracks', { op: 'add', pid, tracks: String(id) }, auth.cookieStr);
      const finalBody = primary.body || {};
      const finalCode = normalizeApiCode(primary);
      const success = finalCode === 200 && !(finalBody && finalBody.error);
      const attempts = [{ api: 'playlist_tracks', code: finalCode, body: finalBody }];
      if (!success) return json({ loggedIn: true, pid, id, success: false, code: finalCode, error: (finalBody && (finalBody.message || finalBody.msg)) || 'PLAYLIST_ADD_FAILED', attempts }, finalCode === 401 ? 401 : 409);
      return json({ loggedIn: true, pid, id, success: true, code: finalCode, body: finalBody, attempts });
    } catch (err) { return json({ error: String(err && err.message || err) }, 500); }
  }

  if (pn === '/api/playlist/subscribe') {
    const auth = await requireLogin(request);
    if (!auth) return json({ error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    try {
      const body = request.method === 'POST' ? await readRequestBody(request) : {};
      const id = body.id || body.playlistId || q.get('id') || '';
      const subscribed = String(body.subscribed != null ? body.subscribed : (q.get('subscribed') || 'true')) !== 'false';
      if (!id) return json({ success: false, error: 'Missing playlist id' }, 400);
      const result = await xeapi('/playlist/subscribe', { id, t: subscribed ? 1 : 0 }, auth.cookieStr);
      const code = normalizeApiCode(result);
      return json({ provider: 'netease', id, subscribed, success: code === 200, code, body: result.body || {} });
    } catch (err) { return json({ provider: 'netease', success: false, error: String(err && err.message || err) }, 500); }
  }

  if (pn === '/api/album/subscribe') {
    const auth = await requireLogin(request);
    if (!auth) return json({ error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    try {
      const body = request.method === 'POST' ? await readRequestBody(request) : {};
      const id = body.id || body.albumId || q.get('id') || '';
      const subscribed = String(body.subscribed != null ? body.subscribed : (q.get('subscribed') || 'true')) !== 'false';
      if (!id) return json({ success: false, error: 'Missing album id' }, 400);
      const result = await xeapi('/album/sub', { id, t: subscribed ? 1 : 0 }, auth.cookieStr);
      const code = normalizeApiCode(result);
      return json({ provider: 'netease', id, subscribed, success: code === 200, code, body: result.body || {} });
    } catch (err) { return json({ provider: 'netease', success: false, error: String(err && err.message || err) }, 500); }
  }

  if (pn === '/api/album/subscribe/check') {
    const auth = await requireLogin(request);
    if (!auth) return json({ error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    try {
      const ids = String(q.get('ids') || q.get('id') || '').split(',').map(v => v.trim()).filter(Boolean);
      if (!ids.length) return json({ provider: 'netease', subscribed: {} });
      const wanted = new Set(ids);
      const found = new Set();
      let offset = 0;
      for (let page = 0; page < 8 && found.size < wanted.size; page++) {
        const result = await xeapi('/album/sublist', { limit: 50, offset }, auth.cookieStr);
        const body = result.body || {};
        const rows = Array.isArray(body.data) ? body.data : (body.albums || []);
        rows.forEach(item => { const id = String(item && item.id || ''); if (wanted.has(id)) found.add(id); });
        if (!body.hasMore || rows.length < 50) break;
        offset += rows.length;
      }
      const subscribed = {};
      ids.forEach(id => { subscribed[id] = found.has(id); });
      return json({ provider: 'netease', ids, subscribed });
    } catch (err) { return json({ provider: 'netease', subscribed: {}, error: String(err && err.message || err) }, 500); }
  }

  // ---- comments (XEAPI 未开放评论路由, 一期降级为空) ----
  if (pn === '/api/song/comments') {
    if (request.method === 'POST') return json({ provider: 'netease', created: false, success: false, error: 'COMMENTS_UNAVAILABLE_ON_WEB' });
    const id = q.get('id');
    if (!id) return json({ error: 'Missing song id', comments: [] }, 400);
    return json({ id, total: 0, comments: [], hot: false });
  }
  if (pn === '/api/song/comments/like') {
    return json({ provider: 'netease', success: false, error: 'COMMENTS_UNAVAILABLE_ON_WEB' });
  }

  // ---- podcasts (search 走 cloudsearch type=1009; dj/hot|detail|program 未在 XEAPI 开放, 降级) ----
  if (pn === '/api/podcast/search') {
    try {
      const kw = String(q.get('keywords') || '').trim();
      const limit = Math.max(6, Math.min(30, parseInt(q.get('limit') || '18', 10) || 18));
      if (!kw) return json({ podcasts: [] });
      const r = await xeapi('/cloudsearch', { keywords: kw, type: 1009, limit }, cookieStr);
      const result = (r.body && r.body.result) || {};
      const raw = result.djRadios || result.djradios || result.radios || [];
      const podcasts = raw.map(mapPodcastRadio).filter(p => p.id);
      return json({ podcasts, total: result.djRadiosCount || result.djradiosCount || podcasts.length });
    } catch (err) { return json({ error: String(err && err.message || err), podcasts: [] }, 500); }
  }
  if (pn === '/api/podcast/hot') return json({ podcasts: [], more: false, error: 'PODCAST_HOT_UNAVAILABLE_ON_WEB' });
  if (pn === '/api/podcast/detail') {
    const rid = q.get('id') || q.get('rid');
    if (!rid) return json({ error: 'Missing podcast id' }, 400);
    return json({ podcast: mapPodcastRadio({ id: rid }), error: 'PODCAST_DETAIL_UNAVAILABLE_ON_WEB' });
  }
  if (pn === '/api/podcast/programs') {
    const rid = q.get('id') || q.get('rid');
    if (!rid) return json({ error: 'Missing podcast id', programs: [] }, 400);
    return json({ radio: { id: rid, rid }, programs: [], more: false, total: 0, error: 'PODCAST_PROGRAMS_UNAVAILABLE_ON_WEB' });
  }
  if (pn === '/api/podcast/my') {
    const info = await getLoginInfo(cookieStr);
    const collections = ['collect', 'created', 'liked'].map(k => podcastCollectionMeta(k, []));
    return json({ loggedIn: !!info.loggedIn, collections });
  }
  if (pn === '/api/podcast/my/items') {
    const info = await getLoginInfo(cookieStr);
    if (!info.loggedIn || !info.userId) return json({ loggedIn: false, items: [] });
    const key = String(q.get('key') || 'collect');
    return json({ loggedIn: true, key, ...podcastCollectionMeta(key, []), itemType: key === 'liked' ? 'voice' : 'radio', items: [] });
  }

  // ---- listen report / total ----
  if (pn === '/api/listen/report') {
    if (request.method !== 'POST') return json({ accepted: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const body = await readRequestBody(request);
      const song = (body && body.song) || {};
      const provider = String(body.provider || song.provider || song.source || 'netease').toLowerCase();
      const songId = String(song.id || '');
      const listenMs = Math.max(0, Number(body.listenMs) || 0);
      const base = { provider: provider === 'netease' ? 'netease' : provider, songId, sessionId: String(body.sessionId || '').slice(0, 160), listenMs, durationMs: Math.max(0, Number(body.durationMs) || 0), localRecorded: false, platformSubmitted: false, historySynced: false, accountDurationSync: 'unsupported' };
      if (provider !== 'netease' || !songId || !cookieStr) return json({ ...base, accepted: false, eligible: false, reason: 'LISTEN_REPORT_NOT_ELIGIBLE' });
      try {
        await xeapi('/scrobble/v1', { id: songId, sourceid: '', time: Math.max(1, Math.round(listenMs / 1000)) }, cookieStr, 6000);
        return json({ ...base, accepted: true, eligible: true, platformSubmitted: true });
      } catch (_) {
        return json({ ...base, accepted: true, eligible: true, platformSubmitted: false });
      }
    } catch (err) { return json({ accepted: false, platformSubmitted: false, error: String(err && err.message || err) }, 502); }
  }
  if (pn === '/api/listen/total') {
    return json({ provider: 'netease', supported: false, accountDurationSync: 'unsupported' });
  }

  return json({ error: 'NOT_FOUND', path: pn }, 404);
}

// ---------------------------------------------------------------- entry

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, url);
      } catch (err) {
        return json({ error: String(err && err.message || err) }, 500);
      }
    }
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
