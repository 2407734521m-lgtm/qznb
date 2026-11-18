import { useEffect, useMemo, useState} from 'react';
import { supabase} from '../lib/supabase';
import { card, h3, mut, rowBtn} from '../pages/admin/shared';
import OptionSheet from './OptionSheet';
import { alertDialog, confirmDialog, promptDialog} from '../lib/dialog';
import {
  checkLicenseConfirm,
  getOverseasPlayback,
  licenseBlock,
  licenseLabel,
  playbackStatusLabel,
} from '../lib/overseasVideoPlayer';

// 海外视频管理后台：9 个子视图，全部走 Supabase（管理员会话）。
// 通过 / 驳回都会写 overseas_video_reviews 并更新 overseas_videos.status。
// 不做任何 GitHub / YouTube API 调用：手动采集只能去 Actions 页点 Run workflow。

const WORKFLOW_URL = 'https://github.com/2407734521m-lgtm/qznb/actions/workflows/overseas-video-daily.yml';

const VIEWS: [string, string][] = [
['runs', '采集记录'],
['review', '待审核'],
['published', '已发布'],
['failures', '失败记录'],
['duplicates', '重复检测'],
['sources', '来源管理'],
['frequency', '采集频率'],
['categories', '分类管理'],
['manual', '手动重新采集'],
];

const PLATFORM_OPTIONS = [
{ value: 'youtube', label: 'YouTube'},
{ value: 'pexels', label: 'Pexels'},
{ value: 'pixabay', label: 'Pixabay'},
{ value: 'archive', label: 'Archive.org'},
{ value: 'wikimedia', label: 'Wikimedia Commons'},
{ value: 'nasa', label: 'NASA'},
{ value: 'peertube', label: 'PeerTube'},
];
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
const SOURCE_TYPE_OPTIONS = [
{ value: 'channel', label: '频道'},
{ value: 'search', label: '搜索'},
{ value: 'playlist', label: '播放列表'},
];
const SOURCE_TYPE_LABEL: Record<string, string> = { channel: '频道', search: '搜索', playlist: '播放列表'};
const REVIEW_FILTERS: [string, string][] = [
['all', '全部'],
['pending_review', '待审核'],
['license_pending', '授权待确认'],
];
const LICENSE_TYPE_OPTIONS = [
{ value: 'cc0', label: 'CC0（公共领域）'},
{ value: 'public_domain', label: '公共领域'},
{ value: 'cc_by', label: 'CC BY（署名后可使用）'},
{ value: 'cc_by_sa', label: 'CC BY-SA（署名-相同方式共享）'},
{ value: 'nasa_public_domain', label: 'NASA 公共领域'},
{ value: 'licensed', label: '已获授权'},
{ value: 'youtube_embed', label: '仅官方嵌入，无转载许可'},
{ value: 'unknown', label: '授权未知'},
];
const COPYRIGHT_STATUS_OPTIONS = [
{ value: 'unknown', label: '未核实'},
{ value: 'verified', label: '已核实有效'},
{ value: 'rejected', label: '已确认无效'},
];
const RUN_STATUS_LABEL: Record<string, string> = {
running: '进行中',
success: '成功',
partial: '部分成功',
failed: '失败',
};

type Category = { id: number; name: string; slug: string; sort_order: number; enabled: boolean};
type Source = {
id: number; platform: string; source_type: string; external_id: string; name: string;
url: string; language: string; category_id: number | null; enabled: boolean;
last_checked_at: string | null; created_at: string;
};
type Run = {
id: number; started_at: string; finished_at: string | null; status: string; trigger: string;
sources_checked: number; found_count: number; new_count: number; duplicate_count: number;
failed_count: number; error: string; log: string;
};
type Video = {
id: number; platform: string; external_video_id: string; source_id: number | null;
category_id: number | null; title: string; author: string; author_url: string;
original_url: string; embed_url: string; thumbnail_url: string; published_at: string | null;
language: string; duration_seconds: number | null; description: string; license_type: string;
status: string; quality_score: number; content_hash: string; duplicate_of: number | null;
review_note: string; created_at: string;
// 以下字段随第二阶段迁移新增；迁移未执行时 select('*') 不返回它们，读到 undefined 即按缺省处理。
license_name?: string | null; license_url?: string | null; copyright_status?: string | null;
file_url?: string | null; attribution?: string | null;
playback_status?: string | null; playback_checked_at?: string | null;
};

const inputStyle: React.CSSProperties = {
width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10,
border: '1px solid #d9dee5', background: '#fff', color: '#1f2a3a', font: 'inherit', fontSize: 14,
};
const btnBase: React.CSSProperties = {
border: '1px solid #d9dee5', borderRadius: 999, padding: '7px 14px', fontSize: 13,
background: '#fff', color: '#22314a', cursor: 'pointer',
};
const btnPrimary: React.CSSProperties = {...btnBase, background: '#22314a', borderColor: '#22314a', color: '#fff'};
const btnDanger: React.CSSProperties = {...btnBase, background: '#b0404f', borderColor: '#b0404f', color: '#fff'};
const btnSmall: React.CSSProperties = {...btnBase, padding: '5px 11px', fontSize: 12.5};
const chipStyle: React.CSSProperties = {
border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 13px', fontSize: 13,
background: '#fff', color: '#22314a', cursor: 'pointer',
};

function fmtTime(s: string | null) {
if (!s) return '—';
return new Date(s).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false});
}
function fmtDate(s: string | null) {
if (!s) return '—';
return new Date(s).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai'});
}
function fmtDuration(sec: number | null) {
if (sec == null) return '';
const m = Math.floor(sec / 60);
const s = sec % 60;
return m > 0? `${m}分${String(s).padStart(2, '0')}秒`: `${s}秒`;
}
function normTitle(t: string) {
return t.toLowerCase().replace(/[\s\-_·•,，。！？!?()（）[\]"'“”‘’:：;；\/\\|]+/g, '');
}
function nextRunBeijing() {
const now = Date.now();
const bj = new Date(now + 8 * 3600 * 1000);
const y = bj.getUTCFullYear();
const m = bj.getUTCMonth();
const d = bj.getUTCDate();
let next = Date.UTC(y, m, d, 7, 0, 0) - 8 * 3600 * 1000;
if (next <= now) next = Date.UTC(y, m, d + 1, 7, 0, 0) - 8 * 3600 * 1000;
return new Date(next).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false});
}

export default function AdminOverseasVideos({ me, setMsg}: { me: string; setMsg?: (s: string) => void}) {
const [view, setView] = useState('review');
const [loading, setLoading] = useState(true);
const [err, setErr] = useState('');
const [categories, setCategories] = useState<Category[]>([]);
const [sources, setSources] = useState<Source[]>([]);
const [runs, setRuns] = useState<Run[]>([]);
const [pending, setPending] = useState<Video[]>([]);
const [published, setPublished] = useState<Video[]>([]);
const [allVideos, setAllVideos] = useState<Video[]>([]);
const [checked, setChecked] = useState<number[]>([]);
const [busy, setBusy] = useState('');
const [playingId, setPlayingId] = useState<number | null>(null);
const [reviewQuery, setReviewQuery] = useState('');
const [reviewShown, setReviewShown] = useState(10);
const [publishedShown, setPublishedShown] = useState(10);
const [thumbFailed, setThumbFailed] = useState<Record<number, boolean>>({});
const [playFailed, setPlayFailed] = useState<Record<number, boolean>>({});
// 新增来源表单
const [sName, setSName] = useState('');
const [sPlatform, setSPlatform] = useState('youtube');
const [sType, setSType] = useState('channel');
const [sExternalId, setSExternalId] = useState('');
const [sLanguage, setSLanguage] = useState('en');
const [sCategory, setSCategory] = useState('');
// 新增分类表单
const [cName, setCName] = useState('');
const [cSlug, setCSlug] = useState('');
// 待审核筛选与授权核实面板（全部放在组件顶部，任何提前返回之前）
const [reviewFilter, setReviewFilter] = useState('all');
const [verifyVideo, setVerifyVideo] = useState<Video | null>(null);
const [vLicenseType, setVLicenseType] = useState('unknown');
const [vLicenseName, setVLicenseName] = useState('');
const [vLicenseUrl, setVLicenseUrl] = useState('');
const [vAttribution, setVAttribution] = useState('');
const [vCopyrightStatus, setVCopyrightStatus] = useState('unknown');

const catName = useMemo(() => {
const m = new Map<number, string>();
categories.forEach(c => m.set(c.id, c.name));
return m;
}, [categories]);
const srcName = useMemo(() => {
const m = new Map<number, string>();
sources.forEach(s => m.set(s.id, s.name));
return m;
}, [sources]);

async function loadAll() {
setLoading(true);
setErr('');
const [cats, srcs, rns, pend, pub, all] = await Promise.all([
supabase.from('overseas_video_categories').select('id, name, slug, sort_order, enabled').order('sort_order'),
supabase.from('overseas_video_sources').select('*').order('id'),
supabase.from('overseas_harvest_runs').select('*').order('started_at', { ascending: false}).limit(30),
supabase.from('overseas_videos').select('*').in('status', ['pending_review', 'license_pending']).order('published_at', { ascending: false}).limit(100),
supabase.from('overseas_videos').select('*').eq('status', 'published').order('published_at', { ascending: false}).limit(100),
supabase.from('overseas_videos').select('*').order('created_at', { ascending: false}).limit(500),
]);
const firstErr = cats.error || srcs.error || rns.error || pend.error || pub.error || all.error;
if (firstErr) {
setErr('读取失败：' + firstErr.message);
} else {
setCategories((cats.data?? []) as Category[]);
setSources((srcs.data?? []) as Source[]);
setRuns((rns.data?? []) as Run[]);
setPending((pend.data?? []) as Video[]);
setPublished((pub.data?? []) as Video[]);
setAllVideos((all.data?? []) as Video[]);
}
setLoading(false);
}

useEffect(() => {
let alive = true;
void (async () => { if (alive) await loadAll();})();
return () => { alive = false;};
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
setReviewShown(10);
}, [reviewQuery, reviewFilter]);

const failedRuns = useMemo(
() => runs.filter(r => r.status === 'failed' || r.status === 'partial' || r.failed_count > 0 || r.error),
[runs],
);
const dupGroups = useMemo(() => {
const groups = new Map<string, Video[]>();
allVideos.forEach(v => {
const key = normTitle(v.title || '');
if (!key) return;
const list = groups.get(key)?? [];
list.push(v);
groups.set(key, list);
});
return [...groups.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length);
}, [allVideos]);
const totalDupFromRuns = useMemo(() => runs.reduce((n, r) => n + (r.duplicate_count || 0), 0), [runs]);
const catCounts = useMemo(() => {
const c = new Map<number, number>();
allVideos.forEach(v => { if (v.category_id!= null) c.set(v.category_id, (c.get(v.category_id)?? 0) + 1);});
return c;
}, [allVideos]);
const pendingReviewCount = useMemo(() => pending.filter(v => v.status === 'pending_review').length, [pending]);
const licensePendingCount = useMemo(() => pending.filter(v => v.status === 'license_pending').length, [pending]);
// 核实面板里“确认授权有效”的实时校验结果：三项缺一不可，
// 授权类型在白名单里、有真实授权链接、版权状态已选为“已核实有效”。
const verifyCheck = checkLicenseConfirm(vLicenseType, vLicenseUrl, vCopyrightStatus);
const shownPending = useMemo(() => {
const q = reviewQuery.trim().toLowerCase();
const list = reviewFilter === 'all'? pending: pending.filter(v => v.status === reviewFilter);
if (!q) return list;
return list.filter(v => (v.title + ' ' + v.author).toLowerCase().includes(q));
}, [pending, reviewQuery, reviewFilter]);

function toggleChecked(id: number) {
setChecked(cur => (cur.includes(id)? cur.filter(x => x!== id): [...cur, id]));
}

async function reviewVideo(v: Video, decision: 'published' | 'rejected', note: string) {
setBusy('review-' + v.id);
const { error: rErr} = await supabase.from('overseas_video_reviews').insert({
video_id: v.id, reviewer: me || null, decision, note,
});
if (rErr) {
setMsg && setMsg('写入审核记录失败：' + rErr.message);
setBusy('');
return;
}
const { error: uErr} = await supabase.from('overseas_videos').update({
status: decision, reviewed_by: me || null, reviewed_at: new Date().toISOString(), review_note: note,
}).eq('id', v.id);
setBusy('');
if (uErr) {
setMsg && setMsg('更新视频状态失败：' + uErr.message);
return;
}
setMsg && setMsg(decision === 'published'? '已发布：' + v.title: '已驳回：' + v.title);
setChecked(cur => cur.filter(x => x!== v.id));
await loadAll();
}

async function approveVideo(v: Video) {
// 纵深防御：按钮已置灰时正常点不到；万一绕过，服务端仍以这句拦截。
const block = licenseBlock(v);
if (block.blocked) {
setMsg && setMsg(block.reason + '：' + v.title);
return;
}
await reviewVideo(v, 'published', '');
}

async function rejectVideo(v: Video) {
const note = await promptDialog('驳回原因（会记在审核记录里）', {
placeholder: '例如：画质太差 / 内容不适合 / 版权不明',
confirmText: '确认驳回',
});
if (note === null) return;
await reviewVideo(v, 'rejected', note.trim());
}

// 授权核实：打开 license_pending 视频的核实面板，带入当前授权信息。
function openVerify(v: Video) {
setVerifyVideo(v);
setVLicenseType(v.license_type || 'unknown');
setVLicenseName(v.license_name || '');
setVLicenseUrl(v.license_url || '');
setVAttribution(v.attribution || '');
setVCopyrightStatus(v.copyright_status || 'unknown');
}

// 只保存授权信息，不改状态：核实面板里的“保存授权信息”用。copyrightOverride
// 用于“确认授权有效/无法授权”时顺带把版权状态记为 verified / rejected。
async function saveLicenseInfo(v: Video, copyrightOverride?: string): Promise<boolean> {
setBusy('verify-' + v.id);
const { error} = await supabase.from('overseas_videos').update({
license_type: vLicenseType,
license_name: vLicenseName.trim(),
license_url: vLicenseUrl.trim(),
attribution: vAttribution.trim(),
copyright_status: copyrightOverride ?? vCopyrightStatus,
}).eq('id', v.id);
setBusy('');
if (error) {
setMsg && setMsg('保存授权信息失败：' + error.message);
return false;
}
return true;
}

// 面板里的“保存授权信息”：只改授权字段，状态仍为授权待确认，面板保持打开，
// 管理员仍需点“确认授权有效”或“确认无法授权”才能解除待确认。
async function saveLicenseInfoOnly() {
const v = verifyVideo;
if (!v) return;
const ok = await saveLicenseInfo(v);
if (!ok) return;
const patch = {
license_type: vLicenseType,
license_name: vLicenseName.trim(),
license_url: vLicenseUrl.trim(),
attribution: vAttribution.trim(),
copyright_status: vCopyrightStatus,
};
setVerifyVideo({ ...v, ...patch});
setPending(cur => cur.map(x => (x.id === v.id? { ...x, ...patch}: x)));
setMsg && setMsg('授权信息已保存，状态仍为授权待确认，请点「确认授权有效」或「确认无法授权」解除待确认。');
}

// “确认授权有效”：先过三项校验（授权类型在白名单里、有真实授权链接、版权状态
// 已选为“已核实有效”），缺一不可；校验不通过不写审核记录、不改状态。校验通过后
// 先保存面板里的授权信息（版权状态记为已核实有效），再写一条 approved 的审核记录
// 注明核实结果，最后把状态改回 pending_review，回到正常待审核流。
// 注意：这层校验目前只能做在前端（后台直连 Supabase，没有服务端函数兜底）。
async function verifyLicenseValid() {
const v = verifyVideo;
if (!v) return;
const check = checkLicenseConfirm(vLicenseType, vLicenseUrl, vCopyrightStatus);
if (!check.ok) {
setMsg && setMsg('不能确认授权有效：' + check.reasons.join('；'));
return;
}
const ok = await saveLicenseInfo(v, 'verified');
if (!ok) return;
setBusy('verify-' + v.id);
const note = `授权核实通过：${licenseLabel(vLicenseType, vLicenseName.trim())}${vLicenseUrl.trim()? '（' + vLicenseUrl.trim() + '）': ''}${vAttribution.trim()? '，署名：' + vAttribution.trim(): ''}，回到待审核`;
const { error: rErr} = await supabase.from('overseas_video_reviews').insert({
video_id: v.id, reviewer: me || null, decision: 'approved', note,
});
if (rErr) {
setBusy('');
setMsg && setMsg('写入审核记录失败：' + rErr.message);
return;
}
const { error: uErr} = await supabase.from('overseas_videos').update({
status: 'pending_review', reviewed_by: me || null, reviewed_at: new Date().toISOString(), review_note: note,
}).eq('id', v.id);
setBusy('');
if (uErr) {
setMsg && setMsg('更新视频状态失败：' + uErr.message);
return;
}
setMsg && setMsg('授权已核实，回到待审核：' + v.title);
setVerifyVideo(null);
setChecked(cur => cur.filter(x => x!== v.id));
await loadAll();
}

// “确认无法授权”：先保存面板里的授权信息（版权状态记为已确认无效），再按驳回处理。
async function verifyLicenseInvalid() {
const v = verifyVideo;
if (!v) return;
const ok = await saveLicenseInfo(v, 'rejected');
if (!ok) return;
setVerifyVideo(null);
await reviewVideo(v, 'rejected', '授权核实：无法确认有效授权，已驳回');
}

async function bulkReview(decision: 'published' | 'rejected') {
if (checked.length === 0) {
setMsg && setMsg('请先勾选要处理的视频');
return;
}
// 批量发布自动跳过授权不明确的视频（驳回不受影响）。
const allTargets = pending.filter(v => checked.includes(v.id));
const skipped = decision === 'published'? allTargets.filter(v => licenseBlock(v).blocked): [];
const targets = decision === 'published'? allTargets.filter(v => !licenseBlock(v).blocked): allTargets;
if (decision === 'published' && targets.length === 0) {
setMsg && setMsg(`勾选的 ${checked.length} 条都因授权待确认不能发布，已全部跳过`);
return;
}
let note = '';
if (decision === 'rejected') {
const r = await promptDialog(`批量驳回 ${checked.length} 条视频的原因`, {
placeholder: '例如：内容不适合',
confirmText: '确认批量驳回',
});
if (r === null) return;
note = r.trim();
} else if (!(await confirmDialog(
`确定把勾选的 ${targets.length} 条视频全部发布吗？` + (skipped.length > 0? `其中 ${skipped.length} 条因授权待确认会自动跳过。`: ''),
{ confirmText: '全部发布'}))) {
return;
}
setBusy('bulk');
let ok = 0;
let fail = 0;
for (const v of targets) {
const { error: rErr} = await supabase.from('overseas_video_reviews').insert({
video_id: v.id, reviewer: me || null, decision, note,
});
if (rErr) { fail++; continue;}
const { error: uErr} = await supabase.from('overseas_videos').update({
status: decision, reviewed_by: me || null, reviewed_at: new Date().toISOString(), review_note: note,
}).eq('id', v.id);
if (uErr) fail++; else ok++;
}
setBusy('');
setChecked([]);
setMsg && setMsg(decision === 'published'
? `批量发布完成：成功 ${ok} 条，失败 ${fail} 条` + (skipped.length > 0? `，跳过 ${skipped.length} 条（授权待确认）`: '')
: `批量驳回完成：成功 ${ok} 条，失败 ${fail} 条`);
await loadAll();
}

async function unpublishVideo(v: Video) {
if (!(await confirmDialog(`确定把「${v.title}」撤下吗？它会回到待审核，不再对外展示。`, { confirmText: '撤下', danger: true}))) return;
setBusy('unpub-' + v.id);
const { error} = await supabase.from('overseas_videos').update({
status: 'pending_review', reviewed_by: me || null, reviewed_at: new Date().toISOString(), review_note: '管理员取消发布，退回待审核',
}).eq('id', v.id);
setBusy('');
if (error) {
setMsg && setMsg('撤下失败：' + error.message);
return;
}
setMsg && setMsg('已撤下，回到待审核：' + v.title);
await loadAll();
}

async function rejectAsDuplicate(v: Video, other: Video) {
if (!(await confirmDialog(`把「${v.title}」按重复驳回吗？保留的是「${other.title}」（#${other.id}）。`, { confirmText: '驳回为重复', danger: true}))) return;
await reviewVideo(v, 'rejected', `重复：与 #${other.id}「${other.title}」相同`);
}

async function toggleSource(s: Source) {
setBusy('src-' + s.id);
const { error} = await supabase.from('overseas_video_sources').update({
enabled:!s.enabled, updated_at: new Date().toISOString(),
}).eq('id', s.id);
setBusy('');
if (error) {
setMsg && setMsg('切换失败：' + error.message);
return;
}
setMsg && setMsg(s.enabled? '已停用来源：' + s.name: '已启用来源：' + s.name);
await loadAll();
}

async function addSource() {
if (!sName.trim()) {
setMsg && setMsg('请填写来源名称');
return;
}
if (!sExternalId.trim()) {
setMsg && setMsg('请填写频道 ID 或搜索关键词');
return;
}
const url = sPlatform === 'youtube' && sType === 'channel'
? `https://www.youtube.com/feeds/videos.xml?channel_id=${sExternalId.trim()}`
: '';
setBusy('src-add');
const { error} = await supabase.from('overseas_video_sources').insert({
platform: sPlatform, source_type: sType, external_id: sExternalId.trim(),
name: sName.trim(), url, language: sLanguage.trim() || 'en',
category_id: sCategory? Number(sCategory): null, enabled: false,
});
setBusy('');
if (error) {
setMsg && setMsg('新增来源失败：' + error.message);
return;
}
setMsg && setMsg('来源已新增（默认停用，确认无误后再启用）：' + sName.trim());
setSName('');
setSExternalId('');
setSCategory('');
await loadAll();
}

async function deleteSource(s: Source) {
const { count, error} = await supabase.from('overseas_videos')
.select('id', { count: 'exact', head: true}).eq('source_id', s.id);
if (error) {
setMsg && setMsg('检查来源下视频失败：' + error.message);
return;
}
if ((count?? 0) > 0) {
await alertDialog(`这个来源下还有 ${count} 条视频，不能删除。先在待审核 / 已发布里处理掉这些视频，或把它们改到别的来源。`);
return;
}
if (!(await confirmDialog(`确定删除来源「${s.name}」吗？删除后不可恢复。`, { confirmText: '删除', danger: true}))) return;
const { error: dErr} = await supabase.from('overseas_video_sources').delete().eq('id', s.id);
if (dErr) {
setMsg && setMsg('删除失败：' + dErr.message);
return;
}
setMsg && setMsg('已删除来源：' + s.name);
await loadAll();
}

async function addCategory() {
if (!cName.trim() ||!cSlug.trim()) {
setMsg && setMsg('请填写分类名称和英文标识');
return;
}
if (!/^[a-z0-9_-]+$/.test(cSlug.trim())) {
setMsg && setMsg('英文标识只能用小写字母、数字、- 或 _');
return;
}
const maxOrder = categories.reduce((n, c) => Math.max(n, c.sort_order || 0), 0);
setBusy('cat-add');
const { error} = await supabase.from('overseas_video_categories').insert({
name: cName.trim(), slug: cSlug.trim(), sort_order: maxOrder + 10, enabled: true,
});
setBusy('');
if (error) {
setMsg && setMsg('新增分类失败：' + error.message);
return;
}
setMsg && setMsg('分类已新增：' + cName.trim());
setCName('');
setCSlug('');
await loadAll();
}

async function toggleCategory(c: Category) {
setBusy('cat-' + c.id);
const { error} = await supabase.from('overseas_video_categories').update({ enabled:!c.enabled}).eq('id', c.id);
setBusy('');
if (error) {
setMsg && setMsg('切换失败：' + error.message);
return;
}
setMsg && setMsg(c.enabled? '已停用分类：' + c.name: '已启用分类：' + c.name);
await loadAll();
}

async function deleteCategory(c: Category) {
const n = catCounts.get(c.id)?? 0;
if (n > 0) {
await alertDialog(`这个分类下还有 ${n} 条视频，不能删除。先把这些视频改到别的分类或驳回。`);
return;
}
if (!(await confirmDialog(`确定删除分类「${c.name}」吗？删除后不可恢复。`, { confirmText: '删除', danger: true}))) return;
const { error} = await supabase.from('overseas_video_categories').delete().eq('id', c.id);
if (error) {
setMsg && setMsg('删除失败：' + error.message);
return;
}
setMsg && setMsg('已删除分类：' + c.name);
await loadAll();
}

function videoCard(v: Video, mode: 'review' | 'published') {
const isPlaying = playingId === v.id;
const playback = getOverseasPlayback(v);
const block = licenseBlock(v);
const playErr = !!playFailed[v.id];
return (
<div key={v.id} style={card}>
<div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap'}}>
{mode === 'review' && (
<input
type="checkbox"
checked={checked.includes(v.id)}
onChange={() => toggleChecked(v.id)}
aria-label={'勾选 ' + v.title}
style={{ width: 20, height: 20, marginTop: 4, accentColor: '#22314a'}}
/>
)}
<div style={{ flex: 1, minWidth: 220}}>
<strong style={{ fontSize: 14, lineHeight: 1.5}}>{v.title || '（无标题）'}</strong>
{v.status === 'license_pending' && (
<span style={{ display: 'inline-block', marginLeft: 8, padding: '2px 9px', borderRadius: 999, background: '#b0404f', color: '#fff', fontSize: 12, fontWeight: 600, verticalAlign: '2px'}}>授权待确认</span>
)}
<p style={{...mut, margin: '6px 0 0'}}>
{v.author || '未知作者'} · {fmtDate(v.published_at)}
{fmtDuration(v.duration_seconds)? ' · ' + fmtDuration(v.duration_seconds): ''}
{' · '}{v.language || 'en'}
{v.category_id!= null && catName.get(v.category_id)? ' · ' + catName.get(v.category_id): ''}
{' · '}{PLATFORM_LABEL[v.platform] || v.platform}
{v.source_id!= null && srcName.get(v.source_id)? ' · 来源：' + srcName.get(v.source_id): ''}
</p>
{v.description && (
<p style={{...mut, margin: '6px 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
{v.description.slice(0, 200)}
</p>
)}
{v.review_note && (
<p style={{...mut, margin: '6px 0 0', color: '#b0404f'}}>审核备注：{v.review_note}</p>
)}
<p style={{...mut, margin: '6px 0 0'}}>
授权：{licenseLabel(v.license_type, v.license_name)}
{v.license_url && (
<> · <a href={v.license_url} target="_blank" rel="noreferrer" style={{ color: '#526b8c'}}>查看授权</a></>
)}
</p>
{v.attribution && (
<p style={{...mut, margin: '4px 0 0'}}>署名要求：{v.attribution}</p>
)}
<p style={{...mut, margin: '4px 0 0'}}>
播放检测：{playbackStatusLabel(v.playback_status)}
{v.playback_checked_at? ' · 检测于 ' + fmtTime(v.playback_checked_at): ''}
{v.playback_status === 'failed' && (
<span style={{ color: '#b0404f'}}>（播放检测失败，发布前请先点原链接核对）</span>
)}
</p>
</div>
</div>
{v.thumbnail_url &&!isPlaying && (
<button
type="button"
onClick={() => { setPlayFailed(cur => ({ ...cur, [v.id]: false })); setPlayingId(v.id); }}
aria-label={'预览播放 ' + v.title}
style={{ display: 'block', width: '100%', padding: 0, marginTop: 10, border: 'none', background: 'none', cursor: 'pointer', position: 'relative'}}
>
{thumbFailed[v.id] ? (
<div style={{ width: '100%', maxWidth: 480, aspectRatio: '16 / 9', borderRadius: 12, background: '#22314a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>封面加载不出来，点这里试播</div>
) : (
<img src={v.thumbnail_url} alt="" loading="lazy" onError={() => setThumbFailed(cur => ({ ...cur, [v.id]: true }))} style={{ width: '100%', maxWidth: 480, borderRadius: 12, display: 'block'}} />
)}
<span style={{
position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
width: 52, height: 52, borderRadius: '50%', background: 'rgba(20,28,40,.75)', color: '#fff',
display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
}}>▶</span>
</button>
)}
{isPlaying && (
<div style={{ marginTop: 10}}>
{playback.kind === 'native-video' && !playErr && (
<video
controls
preload="metadata"
src={playback.src}
onError={() => setPlayFailed(cur => ({ ...cur, [v.id]: true }))}
style={{ width: '100%', maxWidth: 640, aspectRatio: '16 / 9', border: 'none', borderRadius: 12, background: '#000'}}
/>
)}
{playback.kind === 'native-video' && playErr && (
<p style={{...mut, margin: 0, color: '#b0404f'}}>视频加载失败，可能是网络或格式问题，可点下面的「看原链接」查看。</p>
)}
{playback.kind === 'unsupported' && (
<p style={{...mut, margin: 0}}>该格式浏览器可能无法直接播放，可点下面的「看原链接」在原站查看。</p>
)}
{(playback.kind === 'youtube-iframe' || playback.kind === 'embed-iframe') && (
<iframe
src={playback.src}
title={v.title}
loading="lazy"
allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
allowFullScreen
style={{ width: '100%', maxWidth: 640, aspectRatio: '16 / 9', border: 'none', borderRadius: 12}}
/>
)}
{playback.kind === 'none' && (
<p style={{...mut, margin: 0}}>暂无可播放的地址，可点下面的「看原链接」查看。</p>
)}
<div style={{ marginTop: 6}}>
<button type="button" onClick={() => setPlayingId(null)} style={btnSmall}>收起播放</button>
</div>
{playback.kind === 'youtube-iframe' && (
<p style={{...mut, margin: '6px 0 0', fontSize: 12}}>如果一直转圈，说明当前网络打不开 YouTube，点下面的「看原链接」换能打开 YouTube 的网络再看。</p>
)}
{playback.kind === 'embed-iframe' && (
<p style={{...mut, margin: '6px 0 0', fontSize: 12}}>如果一直加载不出来，可能是网络或格式问题，可点下面的「看原链接」查看。</p>
)}
</div>
)}
<div style={{...rowBtn, alignItems: 'center'}}>
{mode === 'review' && (
<>
<button type="button" onClick={() => void approveVideo(v)} disabled={busy!== '' || block.blocked} style={{...btnPrimary, ...(block.blocked? { opacity: 0.45, cursor: 'not-allowed'}: {})}}>
{busy === 'review-' + v.id? '处理中…': '通过发布'}
</button>
{block.blocked && (
<span style={{ fontSize: 12.5, color: '#b0404f'}}>{block.reason}</span>
)}
<button type="button" onClick={() => void rejectVideo(v)} disabled={busy!== ''} style={btnDanger}>
驳回
</button>
{v.status === 'license_pending' && (
<button type="button" onClick={() => openVerify(v)} disabled={busy!== ''} style={btnBase}>
核实授权
</button>
)}
</>
)}
{mode === 'published' && (
<button type="button" onClick={() => void unpublishVideo(v)} disabled={busy!== ''} style={btnDanger}>
{busy === 'unpub-' + v.id? '处理中…': '撤下（回待审核）'}
</button>
)}
{v.original_url && (
<a href={v.original_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#526b8c'}}>
看原链接
</a>
)}
</div>
</div>
);
}

const viewLabel = (VIEWS.find(([k]) => k === view)?? ['', ''])[1];
const lastRun = runs[0];

return (
<div>
<div style={card}>
<h3 style={h3}>海外视频</h3>
<p style={mut}>
每天 07:00（北京时间）自动采集海外优质视频，只存标题、作者、原链接、封面、发布时间、语言、简介等元数据，不下载、不转载视频文件。
所有视频默认进待审核，通过后才对外展示；授权不明的先进「授权待确认」，核实后才能进待审核。
</p>
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10}}>
{VIEWS.map(([k, label]) => {
const count = k === 'review'? pending.length: k === 'published'? published.length: k === 'failures'? failedRuns.length: null;
return (
<button
key={k}
type="button"
onClick={() => setView(k)}
style={{
...chipStyle,
background: view === k? '#22314a': '#fff',
color: view === k? '#fff': '#22314a',
}}
>
{label}{count!== null? `（${count}）`: ''}
</button>
);
})}
<button type="button" onClick={() => void loadAll()} style={chipStyle}>刷新</button>
</div>
</div>

{loading && <div style={card}><p style={mut}>正在读取…</p></div>}
{!loading && err && <div style={card}><p style={mut}>{err}</p></div>}

{!loading &&!err && view === 'runs' && (
<div>
{runs.length === 0 && <div style={card}><p style={mut}>暂无采集记录。每天 07:00 定时跑，跑完这里会出现一条。</p></div>}
{runs.map(r => (
<div key={r.id} style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap'}}>
<strong style={{ fontSize: 14}}>
{fmtTime(r.started_at)} · {r.trigger === 'manual'? '手动触发': '定时触发'}
</strong>
<span style={{ fontSize: 12, color: r.status === 'success'? '#2e7d32': r.status === 'failed'? '#b0404f': '#7a6f5d'}}>
{RUN_STATUS_LABEL[r.status] || r.status}
</span>
</div>
<p style={{...mut, margin: '6px 0 0'}}>
结束：{fmtTime(r.finished_at)} · 检查来源 {r.sources_checked} 个 · 发现 {r.found_count} 条 · 新增 {r.new_count} 条 · 重复 {r.duplicate_count} 条 · 失败 {r.failed_count} 条
</p>
{r.error && <p style={{...mut, margin: '6px 0 0', color: '#b0404f', whiteSpace: 'pre-wrap'}}>错误：{r.error}</p>}
{r.log && (
<pre style={{...mut, margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f7f8f8', borderRadius: 10, padding: 10}}>
{r.log}
</pre>
)}
</div>
))}
</div>
)}

{!loading &&!err && view === 'review' && (
<div>
{verifyVideo && (
<div style={card}>
<h3 style={h3}>核实授权：{verifyVideo.title || '（无标题）'}</h3>
<p style={mut}>
来源：{PLATFORM_LABEL[verifyVideo.platform] || verifyVideo.platform} · 作者：{verifyVideo.author || '未知作者'}
{verifyVideo.original_url && (
<> · <a href={verifyVideo.original_url} target="_blank" rel="noreferrer" style={{ color: '#526b8c'}}>看原链接</a></>
)}
<br />
先核对授权信息，保存只改授权字段、不改状态；点「确认授权有效」后视频回到待审核（可正常发布），点「确认无法授权」则驳回。两项都会写一条审核记录。确认有效有三项硬要求，缺一不可：授权类型必须是真正允许转载的许可（CC0 / 公共领域 / CC BY / CC BY-SA / NASA 公共领域 / 已获授权 / Pexels / Pixabay——“授权未知”和“仅官方嵌入”不能确认有效）、必须有真实授权链接、版权状态须选为“已核实有效”。
</p>
<div style={{ display: 'grid', gap: 10, marginTop: 10}}>
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap'}}>
<OptionSheet
value={vLicenseType}
options={LICENSE_TYPE_OPTIONS}
onChange={setVLicenseType}
title="选择授权类型"
buttonText={licenseLabel(vLicenseType)}
buttonStyle={{...btnBase, minWidth: 200, justifyContent: 'space-between'}}
/>
<OptionSheet
value={vCopyrightStatus}
options={COPYRIGHT_STATUS_OPTIONS}
onChange={setVCopyrightStatus}
title="选择版权状态"
buttonText={(COPYRIGHT_STATUS_OPTIONS.find(o => o.value === vCopyrightStatus)?? COPYRIGHT_STATUS_OPTIONS[0]).label}
buttonStyle={{...btnBase, minWidth: 130, justifyContent: 'space-between'}}
/>
</div>
<input type="text" value={vLicenseName} onChange={e => setVLicenseName(e.target.value)} placeholder="许可证原文，例如 CC BY-SA 4.0" aria-label="许可证原文" style={inputStyle} />
<input type="text" value={vLicenseUrl} onChange={e => setVLicenseUrl(e.target.value)} placeholder="授权链接，例如 https://creativecommons.org/licenses/by/4.0/" aria-label="授权链接" style={inputStyle} />
<input type="text" value={vAttribution} onChange={e => setVAttribution(e.target.value)} placeholder="署名要求，例如：© NASA / 作者名" aria-label="署名要求" style={inputStyle} />
<div style={rowBtn}>
<button type="button" onClick={() => void saveLicenseInfoOnly()} disabled={busy!== ''} style={btnBase}>
{busy === 'verify-' + verifyVideo.id? '保存中…': '保存授权信息'}
</button>
<button type="button" onClick={() => void verifyLicenseValid()} disabled={busy!== '' || !verifyCheck.ok} style={{...btnPrimary, ...(verifyCheck.ok? {}: { opacity: 0.45, cursor: 'not-allowed'})}}>
{busy === 'verify-' + verifyVideo.id? '处理中…': '确认授权有效'}
</button>
<button type="button" onClick={() => void verifyLicenseInvalid()} disabled={busy!== ''} style={btnDanger}>
{busy === 'verify-' + verifyVideo.id? '处理中…': '确认无法授权'}
</button>
<button type="button" onClick={() => setVerifyVideo(null)} disabled={busy!== ''} style={btnBase}>取消</button>
</div>
<p style={{...mut, margin: '8px 0 0'}}>点「确认授权有效」会同时把版权状态记为已核实有效；点「确认无法授权」会同时把版权状态记为已确认无效并驳回。授权待确认期间发布按钮保持置灰。</p>
{!verifyCheck.ok && (
<p style={{ margin: '8px 0 0', fontSize: 13, color: '#b0404f'}}>
还不能确认授权有效：{verifyCheck.reasons.join('；')}。
</p>
)}
</div>
</div>
)}
<div style={card}>
<input
type="search"
value={reviewQuery}
onChange={e => setReviewQuery(e.target.value)}
placeholder="按标题或作者搜索待审核视频…"
aria-label="搜索待审核视频"
style={inputStyle}
/>
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10}}>
{REVIEW_FILTERS.map(([k, label]) => {
const count = k === 'all'? pending.length: k === 'pending_review'? pendingReviewCount: licensePendingCount;
return (
<button
key={k}
type="button"
onClick={() => setReviewFilter(k)}
style={{
...chipStyle,
background: reviewFilter === k? '#22314a': '#fff',
color: reviewFilter === k? '#fff': '#22314a',
}}
>
{label}（{count}）
</button>
);
})}
</div>
<div style={rowBtn}>
<button type="button" onClick={() => void bulkReview('published')} disabled={checked.length === 0 || busy!== ''} style={btnPrimary}>
批量发布（{checked.length}）
</button>
<button type="button" onClick={() => void bulkReview('rejected')} disabled={checked.length === 0 || busy!== ''} style={btnDanger}>
批量驳回（{checked.length}）
</button>
{checked.length > 0 && (
<button type="button" onClick={() => setChecked([])} style={btnBase}>取消勾选</button>
)}
</div>
<p style={{...mut, margin: '8px 0 0'}}>待审核 {pendingReviewCount} 条 + 授权待确认 {licensePendingCount} 条（最多显示 100 条）。一次只出 10 条，点加载更多继续看；mp4 / webm 直链用原生播放器直接播，YouTube 仍走官方嵌入，国内网络可能加载很慢或打不开，卡住时点卡片下的「看原链接」。授权待确认的视频不能发布，卡片上有「授权待确认」角标和「核实授权」按钮，核实通过后回到待审核才能发布；批量发布会自动跳过它们并汇报跳过条数。通过即发布到前台，驳回会记一条审核记录。</p>
</div>
{shownPending.length === 0 && <div style={card}><p style={mut}>{reviewFilter === 'license_pending'? '没有授权待确认的视频。': '没有符合条件的视频。每天 07:00 自动采集的新视频会先到这里。'}</p></div>}
{shownPending.slice(0, reviewShown).map(v => videoCard(v, 'review'))}
{shownPending.length > reviewShown && (
<div style={{ marginTop: 10 }}>
<button type="button" onClick={() => setReviewShown(n => n + 10)} style={btnBase}>加载更多（还剩 {shownPending.length - reviewShown} 条）</button>
</div>
)}
</div>
)}

{!loading &&!err && view === 'published' && (
<div>
<div style={card}>
<p style={mut}>已发布 {published.length} 条（最多显示 100 条）。一次只出 10 条；点封面可以预览：直链视频用原生播放器，YouTube 用官方嵌入，国内网络打不开 YouTube 时会一直转圈，属已知限制；撤下后回到待审核，前台立即看不到。</p>
</div>
{published.length === 0 && <div style={card}><p style={mut}>还没有已发布的视频。去「待审核」通过几条，这里就会出现。</p></div>}
{published.slice(0, publishedShown).map(v => videoCard(v, 'published'))}
{published.length > publishedShown && (
<div style={{ marginTop: 10 }}>
<button type="button" onClick={() => setPublishedShown(n => n + 10)} style={btnBase}>加载更多（还剩 {published.length - publishedShown} 条）</button>
</div>
)}
</div>
)}

{!loading &&!err && view === 'failures' && (
<div>
<div style={card}>
<p style={mut}>只列失败或部分成功的采集轮次。最近 30 轮里失败 {failedRuns.length} 轮；累计跳过重复 {totalDupFromRuns} 条（重复不是失败）。</p>
</div>
{failedRuns.length === 0 && <div style={card}><p style={mut}>暂无失败记录。最近 30 轮全部成功。</p></div>}
{failedRuns.map(r => (
<div key={r.id} style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap'}}>
<strong style={{ fontSize: 14}}>{fmtTime(r.started_at)} · {r.trigger === 'manual'? '手动触发': '定时触发'}</strong>
<span style={{ fontSize: 12, color: '#b0404f'}}>{RUN_STATUS_LABEL[r.status] || r.status}</span>
</div>
<p style={{...mut, margin: '6px 0 0'}}>
发现 {r.found_count} 条 · 新增 {r.new_count} 条 · 重复 {r.duplicate_count} 条 · 失败 {r.failed_count} 条
</p>
{r.error && <p style={{...mut, margin: '6px 0 0', color: '#b0404f', whiteSpace: 'pre-wrap'}}>错误：{r.error}</p>}
{r.log && (
<pre style={{...mut, margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f7f8f8', borderRadius: 10, padding: 10}}>
{r.log}
</pre>
)}
</div>
))}
</div>
)}

{!loading &&!err && view === 'duplicates' && (
<div>
<div style={card}>
<p style={mut}>
按标题归一化（去空格、标点、大小写）分组，只列 2 条以上的组。最近 30 轮采集累计跳过重复 {totalDupFromRuns} 条。
同一视频重复入库会被唯一约束拦住，这里列的是标题相同、来源或链接不同的疑似重复，人工判断后可驳回其中一条。
</p>
</div>
{dupGroups.length === 0 && <div style={card}><p style={mut}>没有发现标题重复的组。</p></div>}
{dupGroups.map((g, gi) => (
<div key={gi} style={card}>
<strong style={{ fontSize: 14}}>疑似重复 · {g.length} 条：{g[0].title}</strong>
{g.map((v, vi) => (
<div key={v.id} style={{ borderTop: vi === 0? 'none': '1px solid #eef1f4', paddingTop: vi === 0? 8: 8, marginTop: 8}}>
<p style={{...mut, margin: 0}}>
#{v.id} · {PLATFORM_LABEL[v.platform] || v.platform} · {v.author || '未知作者'} · {fmtDate(v.published_at)} · 状态：{v.status === 'pending_review'? '待审核': v.status === 'published'? '已发布': v.status === 'rejected'? '已驳回': v.status === 'license_pending'? '授权待确认': v.status}
</p>
<div style={rowBtn}>
{v.original_url && (
<a href={v.original_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#526b8c'}}>看原链接</a>
)}
{vi > 0 && v.status!== 'rejected' && (
<button type="button" onClick={() => void rejectAsDuplicate(v, g[0])} disabled={busy!== ''} style={btnSmall}>
驳回为重复（保留第一条）
</button>
)}
</div>
</div>
))}
</div>
))}
</div>
)}

{!loading &&!err && view === 'sources' && (
<div>
<div style={card}>
<h3 style={h3}>新增来源</h3>
<p style={mut}>YouTube 频道填频道 ID（UC 开头那串），采集器用免 Key 的 RSS 拉最新 15 条；搜索类来源需要对应的免费 API Key 才能跑。新增后默认停用，确认无误再启用。</p>
<div style={{ display: 'grid', gap: 10, marginTop: 10}}>
<input type="text" value={sName} onChange={e => setSName(e.target.value)} placeholder="来源名称，例如：YouTube · TED-Ed 频道" aria-label="来源名称" style={inputStyle} />
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap'}}>
<OptionSheet
value={sPlatform}
options={PLATFORM_OPTIONS}
onChange={setSPlatform}
title="选择平台"
buttonText={PLATFORM_LABEL[sPlatform] || sPlatform}
buttonStyle={{...btnBase, minWidth: 130, justifyContent: 'space-between'}}
/>
<OptionSheet
value={sType}
options={SOURCE_TYPE_OPTIONS}
onChange={setSType}
title="选择来源类型"
buttonText={SOURCE_TYPE_LABEL[sType] || sType}
buttonStyle={{...btnBase, minWidth: 110, justifyContent: 'space-between'}}
/>
<OptionSheet
value={sCategory}
options={[{ value: '', label: '无分类'},...categories.map(c => ({ value: String(c.id), label: c.name}))]}
onChange={setSCategory}
title="选择分类"
buttonText={sCategory? (catName.get(Number(sCategory))?? '无分类'): '无分类'}
buttonStyle={{...btnBase, minWidth: 110, justifyContent: 'space-between'}}
/>
</div>
<input type="text" value={sExternalId} onChange={e => setSExternalId(e.target.value)} placeholder={sType === 'channel'? '频道 ID，例如 UCsooa4yRKGN_zEE8iknghZA': '搜索关键词，例如 nature documentary'} aria-label="频道 ID 或搜索关键词" style={inputStyle} />
<input type="text" value={sLanguage} onChange={e => setSLanguage(e.target.value)} placeholder="语言，例如 en" aria-label="语言" style={inputStyle} />
<div>
<button type="button" onClick={() => void addSource()} disabled={busy!== ''} style={btnPrimary}>
{busy === 'src-add'? '保存中…': '新增来源'}
</button>
</div>
</div>
</div>
{sources.length === 0 && <div style={card}><p style={mut}>暂无来源。</p></div>}
{sources.map(s => (
<div key={s.id} style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap'}}>
<strong style={{ fontSize: 14}}>{s.name || '（未命名来源）'}</strong>
<span style={{ fontSize: 12, color: s.enabled? '#2e7d32': '#7a8894'}}>{s.enabled? '已启用': '已停用'}</span>
</div>
<p style={{...mut, margin: '6px 0 0'}}>
{PLATFORM_LABEL[s.platform] || s.platform} · {SOURCE_TYPE_LABEL[s.source_type] || s.source_type} · 语言 {s.language || 'en'}
{s.category_id!= null && catName.get(s.category_id)? ' · 分类：' + catName.get(s.category_id): ''}
{s.last_checked_at? ' · 上次检查 ' + fmtTime(s.last_checked_at): ''}
</p>
{s.external_id && <p style={{...mut, margin: '4px 0 0', wordBreak: 'break-all'}}>ID：{s.external_id}</p>}
<div style={rowBtn}>
<button type="button" onClick={() => void toggleSource(s)} disabled={busy!== ''} style={btnBase}>
{busy === 'src-' + s.id? '处理中…': s.enabled? '停用': '启用'}
</button>
<button type="button" onClick={() => void deleteSource(s)} disabled={busy!== ''} style={btnDanger}>删除</button>
</div>
</div>
))}
</div>
)}

{!loading &&!err && view === 'frequency' && (
<div>
<div style={card}>
<h3 style={h3}>采集频率（只读）</h3>
<p style={mut}>
采集频率由 GitHub Actions 工作流的定时决定，不在后台改——后台改了数字也不会生效，所以这里只展示真实值，不做假开关。
</p>
<p style={{...mut, margin: '8px 0 0'}}>
当前：每天一次，北京时间 07:00（工作流 cron 为 0 23 * * *，即每天 23:00 UTC）。
<br />
下一次采集：{nextRunBeijing()}
<br />
最近一次：{lastRun? `${fmtTime(lastRun.started_at)} · ${RUN_STATUS_LABEL[lastRun.status] || lastRun.status} · 新增 ${lastRun.new_count} 条`: '暂无记录'}
</p>
<p style={{...mut, margin: '8px 0 0'}}>
改频率要改仓库里的.github/workflows/overseas-video-daily.yml 的 cron 行，改完推送即生效。
</p>
</div>
</div>
)}

{!loading &&!err && view === 'categories' && (
<div>
<div style={card}>
<h3 style={h3}>新增分类</h3>
<div style={{ display: 'grid', gap: 10, marginTop: 10}}>
<input type="text" value={cName} onChange={e => setCName(e.target.value)} placeholder="分类名称，例如：校园生活" aria-label="分类名称" style={inputStyle} />
<input type="text" value={cSlug} onChange={e => setCSlug(e.target.value)} placeholder="英文标识，例如 campus（只能小写字母、数字、-、_）" aria-label="英文标识" style={inputStyle} />
<div>
<button type="button" onClick={() => void addCategory()} disabled={busy!== ''} style={btnPrimary}>
{busy === 'cat-add'? '保存中…': '新增分类'}
</button>
</div>
</div>
</div>
{categories.length === 0 && <div style={card}><p style={mut}>暂无分类。</p></div>}
{categories.map(c => (
<div key={c.id} style={card}>
<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap'}}>
<strong style={{ fontSize: 14}}>{c.name} <span style={{...mut, fontWeight: 400}}>（{c.slug}）</span></strong>
<span style={{ fontSize: 12, color: c.enabled? '#2e7d32': '#7a8894'}}>{c.enabled? '已启用': '已停用'}</span>
</div>
<p style={{...mut, margin: '6px 0 0'}}>视频 {catCounts.get(c.id)?? 0} 条 · 排序 {c.sort_order}</p>
<div style={rowBtn}>
<button type="button" onClick={() => void toggleCategory(c)} disabled={busy!== ''} style={btnBase}>
{busy === 'cat-' + c.id? '处理中…': c.enabled? '停用': '启用'}
</button>
<button type="button" onClick={() => void deleteCategory(c)} disabled={busy!== ''} style={btnDanger}>删除</button>
</div>
</div>
))}
</div>
)}

{!loading &&!err && view === 'manual' && (
<div>
<div style={card}>
<h3 style={h3}>手动重新采集</h3>
<p style={mut}>
后台页面没有 GitHub 的密钥，点按钮并不能直接触发采集——所以这里不放假按钮，只给真实入口。
最近一次：{lastRun? `${fmtTime(lastRun.started_at)} · ${RUN_STATUS_LABEL[lastRun.status] || lastRun.status} · 新增 ${lastRun.new_count} 条`: '暂无记录'}
</p>
<p style={{...mut, margin: '8px 0 0', wordBreak: 'break-all'}}>
工作流地址：
<br />
{WORKFLOW_URL}
</p>
<div style={rowBtn}>
<a href={WORKFLOW_URL} target="_blank" rel="noreferrer" style={{...btnPrimary, textDecoration: 'none', display: 'inline-block'}}>
打开 GitHub Actions 工作流
</a>
</div>
<p style={{...mut, margin: '10px 0 0'}}>
打开后点右上角「Run workflow」，dry_run 保持 false，点绿色「Run workflow」按钮提交。
采集约 1 分钟跑完，跑完刷新「采集记录」就能看到新的一条；新视频先进「待审核」，不会直接公开。
</p>
</div>
</div>
)}

<p style={{...mut, marginTop: 4}}>当前视图：{viewLabel}</p>
</div>
);
}
