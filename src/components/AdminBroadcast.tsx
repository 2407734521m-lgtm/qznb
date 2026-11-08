import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { card, h3, mut, rowBtn, alog, timeAgo } from '../pages/admin/shared';
import { confirmDialog, promptDialog } from '../lib/dialog';
import OptionSheet from './OptionSheet';
import DateTimeField from './DateTimeField';
import './BroadcastPopup.css';

const KIND_OPTIONS = [
  { value: 'popup', label: '普通弹窗' },
  { value: 'location', label: '位置征集弹窗' },
  { value: 'vote', label: '投票征集弹窗' },
  { value: 'form', label: '填写征集弹窗' },
  { value: 'signup', label: '报名弹窗' },
  { value: 'refresh', label: '远程刷新（不弹窗）' },
];
const AUDIENCE_OPTIONS = [
  { value: 'all', label: '全部成员' },
  { value: 'app', label: '仅软件版' },
  { value: 'web', label: '仅网页版' },
  { value: 'selected', label: '指定成员' },
];
const EXP_OPTIONS = [
  { value: '0', label: '不过期' },
  { value: '1', label: '1 天' },
  { value: '3', label: '3 天' },
  { value: '7', label: '7 天' },
];
const WHEN_OPTIONS = [
  { value: 'now', label: '立即发布' },
  { value: 'later', label: '定时发布' },
];
const SHEET_BTN = { padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(34,49,74,.25)', background: '#fff', color: '#22314a', fontSize: 13.5 } as const;

// 预览弹窗与成员端 BroadcastPopup 共用文案口径。
const PREVIEW_KICKER: Record<string, string> = {
  popup: '管理员广播', location: '位置共享', vote: '投票征集',
  form: '信息征集', signup: '活动报名', refresh: '远程刷新',
};
const PREVIEW_DEFAULT_TITLE: Record<string, string> = {
  popup: '管理员消息', location: '位置共享邀请', vote: '投票征集',
  form: '信息征集', signup: '活动报名', refresh: '远程刷新',
};

function fmtStart(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 结果统计条：藏青色占比条，纸面风。
function StatBar({ label, n, total, unit }: { label: string; n: number; total: number; unit: string }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0', fontSize: 12.5, color: '#22314a' }}>
      <span style={{ flex: '0 0 88px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(34,49,74,.1)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#22314a', borderRadius: 4 }} />
      </span>
      <span style={{ flex: '0 0 auto', color: '#817669' }}>{n} {unit} · {pct}%</span>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { popup: '普通弹窗', location: '位置征集', vote: '投票征集', form: '填写征集', signup: '报名', refresh: '远程刷新' };
const AUDIENCE_LABEL: Record<string, string> = { all: '全部', app: '仅软件版', web: '仅网页版', selected: '指定成员' };
const STATUS_LABEL: Record<string, string> = {
  seen: '已读', declined: '暂不分享', shared: '已共享', denied: '系统未授权',
  voted: '已投票', submitted: '已填写', joined: '参加', not_joined: '不参加',
};

function statusLabel(kind: string, status: string): string {
  if (status === 'declined') return kind === 'location' ? '暂不分享' : '暂不参与';
  if (status === 'seen' && kind === 'refresh') return '已刷新';
  return STATUS_LABEL[status] ?? status;
}

type BroadcastRow = {
  id: number; kind: string; title: string; body: string; button_label: string;
  audience: string; created_at: string; expires_at: string | null; revoked: boolean;
  options: unknown;
  target_ids: unknown;
  starts_at: string | null;
  poke_at: string | null;
  poke_count: number;
};

type TemplateRow = {
  id: number; name: string; kind: string; title: string | null; body: string | null;
  options: unknown; audience: string;
};

function templateOptions(t: TemplateRow): string[] {
  if (!Array.isArray(t.options)) return [];
  return t.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
}

function rowTargets(row: BroadcastRow): string[] {
  if (!Array.isArray(row.target_ids)) return [];
  return row.target_ids.filter((o): o is string => typeof o === 'string');
}
type ReceiptRow = { broadcast_id: number; user_id: string; status: string; region: string | null; answer: string | null; updated_at: string };

function rowOptions(row: BroadcastRow): string[] {
  if (!Array.isArray(row.options)) return [];
  return row.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
}

export default function AdminBroadcast({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [kind, setKind] = useState('popup');
  const [audience, setAudience] = useState('all');
  const [exp, setExp] = useState('0');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [buttonLabel, setButtonLabel] = useState('知道了');
  const [optionsText, setOptionsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<BroadcastRow[]>([]);
  const [counts, setCounts] = useState<Record<number, Record<string, number>>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [respondents, setRespondents] = useState<ReceiptRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [whenMode, setWhenMode] = useState('now');
  const [startAt, setStartAt] = useState('');
  const [preview, setPreview] = useState(false);
  const [pvVote, setPvVote] = useState('');
  const [pvForm, setPvForm] = useState('');
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templatePick, setTemplatePick] = useState('');

  // 指定成员受众：第一次切到「指定成员」时拉一次成员名单供勾选。
  useEffect(() => {
    if (audience !== 'selected' || members.length) return;
    void (async () => {
      const { data } = await supabase.from('profiles')
        .select('id, display_name, username')
        .order('created_at', { ascending: true })
        .limit(200);
      setMembers((data ?? []).map((p: { id: string; display_name: string | null; username: string | null }) => ({
        id: p.id,
        label: p.display_name || p.username || '成员',
      })));
    })();
  }, [audience, members.length]);

  function toggleTarget(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from('broadcast_templates')
      .select('id, name, kind, title, body, options, audience')
      .order('created_at', { ascending: false });
    setTemplates((data ?? []) as TemplateRow[]);
  }, []);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  // 套用模板：只填类型/标题/正文/投票选项/可见范围，指定成员名单与发布时间不入模板。
  function applyTemplate(idStr: string) {
    setTemplatePick(idStr);
    const t = templates.find(x => String(x.id) === idStr);
    if (!t) return;
    if (KIND_LABEL[t.kind]) setKind(t.kind);
    if (AUDIENCE_LABEL[t.audience]) setAudience(t.audience);
    setTitle(t.title ?? '');
    setBody(t.body ?? '');
    setOptionsText(templateOptions(t).join('\n'));
  }

  async function saveTemplate() {
    const name = await promptDialog('给这个模板起个名字', { placeholder: '例如：周末活动报名', confirmText: '保存模板' });
    if (!name || !name.trim()) return;
    const voteOpts = kind === 'vote'
      ? [...new Set(optionsText.split('\n').map(s => s.trim()).filter(s => s.length > 0))].slice(0, 6)
      : [];
    const { error } = await supabase.from('broadcast_templates').insert({
      name: name.trim(),
      kind,
      title: title.trim() || null,
      body: body.trim() || null,
      options: voteOpts,
      audience,
      created_by: me,
    });
    if (error) { setMsg('模板保存失败：' + error.message); return; }
    await alog('broadcast_template_save', { kind, audience });
    setMsg('模板已保存，下次在上方选一下就能套用');
    void loadTemplates();
  }

  async function deleteTemplate() {
    const t = templates.find(x => String(x.id) === templatePick);
    if (!t) return;
    const ok = await confirmDialog(`删除模板「${t.name}」？删掉后不能恢复。`, { confirmText: '删除', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('broadcast_templates').delete().eq('id', t.id);
    if (error) { setMsg('模板删除失败：' + error.message); return; }
    setTemplatePick('');
    setMsg('模板已删除');
    void loadTemplates();
  }

  const load = useCallback(async () => {
    const { data } = await supabase.from('admin_broadcasts')
      .select('id, kind, title, body, button_label, audience, created_at, expires_at, revoked, options, target_ids, starts_at, poke_at, poke_count')
      .order('created_at', { ascending: false })
      .limit(30);
    const rows = (data ?? []) as BroadcastRow[];
    setList(rows);
    if (rows.length) {
      const { data: recs } = await supabase.from('broadcast_receipts')
        .select('broadcast_id, status')
        .in('broadcast_id', rows.map(r => r.id));
      const agg: Record<number, Record<string, number>> = {};
      (recs ?? []).forEach((r: { broadcast_id: number; status: string }) => {
        agg[r.broadcast_id] = agg[r.broadcast_id] ?? {};
        agg[r.broadcast_id][r.status] = (agg[r.broadcast_id][r.status] ?? 0) + 1;
      });
      setCounts(agg);
    } else {
      setCounts({});
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function publish() {
    const t = title.trim();
    const b = body.trim();
    const voteOpts = kind === 'vote'
      ? [...new Set(optionsText.split('\n').map(s => s.trim()).filter(s => s.length > 0))].slice(0, 6)
      : [];
    if (kind === 'popup' && !t && !b) { setMsg('弹窗标题和正文至少填一个'); return; }
    if (kind === 'vote') {
      if (!t) { setMsg('投票弹窗先填问题（标题）'); return; }
      if (voteOpts.length < 2) { setMsg('投票至少要 2 个选项，一行一个'); return; }
    }
    if (kind === 'form' && !t && !b) { setMsg('填写征集的标题和说明至少填一个'); return; }
    if (kind === 'signup' && !t && !b) { setMsg('报名弹窗的标题和说明至少填一个'); return; }
    if (audience === 'selected' && selectedIds.length === 0) { setMsg('指定成员要先勾选至少一位成员'); return; }
    let startsAtIso: string | null = null;
    if (whenMode === 'later') {
      if (!startAt) { setMsg('定时发布要先选发布时间'); return; }
      const at = new Date(startAt);
      if (isNaN(at.getTime()) || at.getTime() <= Date.now()) { setMsg('发布时间要晚于现在'); return; }
      startsAtIso = at.toISOString();
    }
    setBusy(true);
    const days = parseInt(exp, 10);
    const { error } = await supabase.from('admin_broadcasts').insert({
      kind,
      title: t || (kind === 'location' ? '位置共享邀请' : kind === 'refresh' ? '远程刷新' : ''),
      body: b,
      button_label: kind === 'popup' ? (buttonLabel.trim() || '知道了') : '知道了',
      audience,
      created_by: me,
      options: voteOpts,
      target_ids: audience === 'selected' ? selectedIds : [],
      starts_at: startsAtIso,
      expires_at: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null,
    });
    setBusy(false);
    if (error) { setMsg('发布失败：' + error.message); return; }
    await alog('broadcast_post', { kind, audience, exp_days: days, targets: audience === 'selected' ? selectedIds.length : 0, starts_at: startsAtIso });
    setTitle(''); setBody(''); setButtonLabel('知道了'); setOptionsText(''); setSelectedIds([]); setExp('0');
    setWhenMode('now'); setStartAt('');
    if (startsAtIso) {
      setMsg(`已预约：${fmtStart(startsAtIso)} 自动发布，成员到点打开网站时就会收到`);
    } else {
      setMsg(kind === 'refresh'
        ? '远程刷新已发布，成员打开或停留在网站时会自动刷新到最新页面'
        : `${KIND_LABEL[kind]}已发布，成员打开网站时就会弹窗`);
    }
    void load();
  }

  // 催办：把 poke_at 记为现在，之前选了「暂不参与」的成员下次轮询会被重新弹一次。
  async function poke(row: BroadcastRow) {
    const ok = await confirmDialog('催办这条广播？之前选了「暂不参与」的人会再收到一次这条弹窗；还没打开过网站的人本来下次打开就会看到，不受影响。', { confirmText: '催办' });
    if (!ok) return;
    const { error } = await supabase.from('admin_broadcasts')
      .update({ poke_at: new Date().toISOString(), poke_count: (row.poke_count ?? 0) + 1 })
      .eq('id', row.id);
    if (error) { setMsg('催办失败：' + error.message); return; }
    await alog('broadcast_poke', { id: row.id, kind: row.kind });
    setMsg('已催办：选了「暂不参与」的人会再收到一次这条弹窗');
    void load();
  }

  async function revoke(row: BroadcastRow) {
    const ok = await confirmDialog('撤回这条广播？撤回后还没看到的成员就不会再收到这条弹窗，已经回执的记录会保留。', { confirmText: '撤回', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('admin_broadcasts').update({ revoked: true }).eq('id', row.id);
    if (error) { setMsg('撤回失败：' + error.message); return; }
    await alog('broadcast_revoke', { id: row.id, kind: row.kind });
    setMsg('已撤回');
    void load();
  }

  async function toggleDetail(row: BroadcastRow) {
    if (expanded === row.id) { setExpanded(null); return; }
    setExpanded(row.id);
    setLoadingDetail(true);
    const { data } = await supabase.from('broadcast_receipts')
      .select('broadcast_id, user_id, status, region, answer, updated_at')
      .eq('broadcast_id', row.id)
      .order('updated_at', { ascending: false });
    const recs = (data ?? []) as ReceiptRow[];
    setRespondents(recs);
    // 展开名单时顺手用最新回执刷新这一条的计数，避免列表计数还是打开页面时的旧数。
    const agg: Record<string, number> = {};
    recs.forEach(r => { agg[r.status] = (agg[r.status] ?? 0) + 1; });
    setCounts(prev => ({ ...prev, [row.id]: agg }));
    if (recs.length) {
      const ids = [...new Set(recs.map(r => r.user_id))];
      const { data: profs } = await supabase.from('profiles').select('id, display_name, username').in('id', ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; display_name: string | null; username: string | null }) => {
        map[p.id] = p.display_name || p.username || '成员';
      });
      setNames(map);
    }
    setLoadingDetail(false);
  }

  // 复制名单：把当前展开的回执整理成纯文本（按状态分组，填写带原文），粘到微信/文档里就能用。
  async function copyRespondents(row: BroadcastRow) {
    if (!respondents.length) { setMsg('还没有回执可复制'); return; }
    const name = (id: string) => names[id] ?? '成员';
    const lines: string[] = [`${row.title || KIND_LABEL[row.kind]} · 回执名单`];
    if (row.kind === 'vote') {
      rowOptions(row).forEach(opt => {
        const who = respondents.filter(r => r.status === 'voted' && r.answer === opt).map(r => name(r.user_id));
        if (who.length) lines.push(`投票-${opt}（${who.length} 人）：${who.join('、')}`);
      });
      respondents.filter(r => r.status !== 'voted')
        .forEach(r => lines.push(`${statusLabel(row.kind, r.status)}：${name(r.user_id)}`));
    } else if (row.kind === 'form') {
      respondents.forEach(r => {
        lines.push(r.status === 'submitted'
          ? `${name(r.user_id)}：${r.answer ?? ''}`
          : `${statusLabel(row.kind, r.status)}：${name(r.user_id)}`);
      });
    } else {
      const byStatus = new Map<string, string[]>();
      respondents.forEach(r => {
        const label = statusLabel(row.kind, r.status);
        const entry = name(r.user_id) + (r.region ? `（${r.region}）` : '');
        byStatus.set(label, [...(byStatus.get(label) ?? []), entry]);
      });
      byStatus.forEach((who, label) => lines.push(`${label}：${who.join('、')}`));
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setMsg('名单已复制，去微信或文档里粘贴即可');
    } catch {
      setMsg('复制失败：这个浏览器不允许直接复制');
    }
  }

  function openPreview() {
    setPvVote('');
    setPvForm('');
    setPreview(true);
  }

  function stateOf(row: BroadcastRow): string {
    if (row.revoked) return '已撤回';
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return '已过期';
    if (row.starts_at && new Date(row.starts_at).getTime() > Date.now()) return `待发布 · ${fmtStart(row.starts_at)}发布`;
    return '进行中';
  }

  function countText(row: BroadcastRow): string {
    const c = counts[row.id] ?? {};
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    if (!total) return '暂无回执';
    const parts = Object.entries(c).map(([s, n]) => `${statusLabel(row.kind, s)} ${n}`);
    return `回执 ${total}：${parts.join(' · ')}`;
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid rgba(34,49,74,.2)', fontSize: 14, background: '#fff', color: '#22314a', boxSizing: 'border-box' };

  const pvOptions = [...new Set(optionsText.split('\n').map(s => s.trim()).filter(s => s.length > 0))].slice(0, 6);
  const pickedTemplate = templates.find(t => String(t.id) === templatePick);
  const nowDate = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const nowLocalMin = `${nowDate.getFullYear()}-${pad2(nowDate.getMonth() + 1)}-${pad2(nowDate.getDate())}T${pad2(nowDate.getHours())}:${pad2(nowDate.getMinutes())}`;

  return (
    <div>
      <div style={card}>
        <h3 style={h3}>常用模板</h3>
        {templates.length === 0
          ? <p style={mut}>暂无模板。在下面把广播填好，点「存为模板」，下次选一下就能直接套用，不用重打。</p>
          : <p style={mut}>选一个模板会把类型、标题、正文、投票选项和可见范围填进下面的发布表单（指定成员名单和发布时间不入模板）。</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          <OptionSheet
            value={templatePick}
            options={[{ value: '', label: '不使用模板' }, ...templates.map(t => ({ value: String(t.id), label: `${t.name}（${KIND_LABEL[t.kind] ?? t.kind}）` }))]}
            onChange={applyTemplate}
            buttonText={pickedTemplate ? `模板：${pickedTemplate.name}` : '选择模板'}
            title="常用模板"
            buttonStyle={SHEET_BTN}
          />
          <button type="button" className="mini ghost" onClick={() => void saveTemplate()}>存为模板</button>
          {pickedTemplate && (
            <button type="button" className="mini ghost" onClick={() => void deleteTemplate()}>删除所选模板</button>
          )}
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>发布弹窗</h3>
        <p style={mut}>
          普通弹窗：弹一次，点按钮记已读。位置征集：成员自愿共享城市 / 地区，本人点同意才定位，不存精确位置。投票征集：成员选一项，后台看票数和名单。填写征集：成员填一段文字提交。报名：成员选参加 / 不参加，后台自动统计。远程刷新：不弹窗，成员在网站时会自动刷新到最新页面，专治旧缓存。可见范围可选全部 / 仅软件版 / 仅网页版 / 指定成员（勾谁谁收到），都能设有效期、能撤回，每人只处理一次。还能定时发布（到点自动发出）、发布前先预览效果，发出后对选了「暂不参与」的人可以催办再弹一次。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          <OptionSheet value={kind} options={KIND_OPTIONS} onChange={setKind} buttonText={KIND_LABEL[kind]} title="弹窗类型" buttonStyle={SHEET_BTN} />
          <OptionSheet value={audience} options={AUDIENCE_OPTIONS} onChange={setAudience} buttonText={AUDIENCE_LABEL[audience]} title="可见范围" buttonStyle={SHEET_BTN} />
          <OptionSheet value={exp} options={EXP_OPTIONS} onChange={setExp} buttonText={EXP_OPTIONS.find(o => o.value === exp)?.label ?? '不过期'} title="有效期" buttonStyle={SHEET_BTN} />
          <OptionSheet value={whenMode} options={WHEN_OPTIONS} onChange={setWhenMode} buttonText={whenMode === 'later' ? '定时发布' : '立即发布'} title="发布时间" buttonStyle={SHEET_BTN} />
        </div>
        {whenMode === 'later' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 10px' }}>
            <span style={{ fontSize: 13, color: '#817669' }}>发布时间：</span>
            <div style={{ width: 230, maxWidth: '100%' }}>
              <DateTimeField
                value={startAt}
                onChange={setStartAt}
                mode="datetime"
                min={nowLocalMin}
                placeholder="选择日期和时间"
                style={{ margin: 0, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(34,49,74,.25)', background: '#fff', color: '#22314a', fontSize: 13.5 }}
              />
            </div>
            <span style={{ fontSize: 12.5, color: '#817669' }}>到点自动发出，不用守着。</span>
          </div>
        )}
        {audience === 'selected' && (
          <div style={{ border: '1px solid rgba(34,49,74,.15)', borderRadius: 10, padding: '8px 10px', marginBottom: 10, background: '#fff' }}>
            <p style={{ ...mut, margin: '0 0 6px' }}>勾选要收到的成员（已选 {selectedIds.length} 人）：</p>
            {members.length === 0 && <p style={mut}>正在加载成员名单…</p>}
            <div style={{ maxHeight: 168, overflowY: 'auto' }}>
              {members.map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13.5, color: '#22314a', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleTarget(m.id)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        )}
        {kind === 'refresh' && (
          <p style={{ ...mut, margin: '0 0 8px' }}>远程刷新不用填标题和正文，发布后成员的页面会自动刷新一次；谁刷新了会记在下面的回执名单里。</p>
        )}
        <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
          placeholder={kind === 'location' ? '标题（留空用「位置共享邀请」）' : kind === 'vote' ? '投票问题（标题，必填）' : '弹窗标题'} />
        <textarea style={{ ...inputStyle, marginTop: 8, minHeight: 76, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} maxLength={500}
          placeholder={kind === 'location' ? '说明为什么想收集大家的城市 / 地区（会显示在弹窗里）' : kind === 'vote' ? '补充说明（可留空）' : kind === 'form' ? '说明要收集什么（会显示在弹窗里）' : kind === 'signup' ? '活动说明：时间、地点、要带什么' : '弹窗正文'} />
        {kind === 'vote' && (
          <textarea style={{ ...inputStyle, marginTop: 8, minHeight: 88, resize: 'vertical' }} value={optionsText} onChange={e => setOptionsText(e.target.value)} maxLength={300}
            placeholder={'投票选项，一行一个，至少 2 个、最多 6 个\n例如：\n周六\n周日'} />
        )}
        {kind === 'popup' && (
          <input style={{ ...inputStyle, marginTop: 8 }} value={buttonLabel} onChange={e => setButtonLabel(e.target.value)} maxLength={12}
            placeholder="按钮文字（默认「知道了」）" />
        )}
        <div style={rowBtn}>
          <button type="button" className="pri" style={{ width: 'auto', padding: '10px 22px' }} disabled={busy} onClick={() => void publish()}>
            {busy ? '发布中…' : whenMode === 'later' ? '预约发布' : '发布'}
          </button>
          <button type="button" className="mini ghost" onClick={openPreview}>预览效果</button>
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>发布记录与回执</h3>
        {list.length === 0 && <p style={mut}>还没有发过广播弹窗。</p>}
        {list.map(row => (
          <div key={row.id} style={{ borderTop: '1px solid rgba(34,49,74,.08)', padding: '10px 0' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: '#22314a' }}>{row.title || '（无标题）'}</strong>
              <span style={{ fontSize: 12, color: '#817669' }}>
                {KIND_LABEL[row.kind]} · {AUDIENCE_LABEL[row.audience]} · {stateOf(row)} · {timeAgo(row.created_at)}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" className="mini ghost" onClick={() => void toggleDetail(row)}>
                {expanded === row.id ? '收起名单' : '看回执名单'}
              </button>
              {!row.revoked && row.kind !== 'refresh' && (
                <button type="button" className="mini ghost" onClick={() => void poke(row)}>催办</button>
              )}
              {!row.revoked && (
                <button type="button" className="mini ghost" onClick={() => void revoke(row)}>撤回</button>
              )}
            </div>
            {row.body && <p style={{ ...mut, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{row.body}</p>}
            {row.kind === 'vote' && rowOptions(row).length > 0 && (
              <p style={{ ...mut, margin: '4px 0 0' }}>选项：{rowOptions(row).join(' / ')}</p>
            )}
            {row.audience === 'selected' && rowTargets(row).length > 0 && (
              <p style={{ ...mut, margin: '4px 0 0' }}>指定 {rowTargets(row).length} 位成员</p>
            )}
            <p style={{ ...mut, margin: '4px 0 0' }}>{countText(row)}</p>
            {row.poke_count > 0 && (
              <p style={{ ...mut, margin: '4px 0 0' }}>已催办 {row.poke_count} 次</p>
            )}
            {expanded === row.id && (
              <div style={{ marginTop: 8 }}>
                {loadingDetail && <p style={mut}>正在加载名单…</p>}
                {!loadingDetail && respondents.length === 0 && <p style={mut}>还没有成员回执。</p>}
                {!loadingDetail && row.kind === 'vote' && respondents.some(r => r.status === 'voted') && (
                  <p style={{ ...mut, margin: '2px 0 6px' }}>
                    票数：{rowOptions(row).map(opt => {
                      const n = respondents.filter(r => r.status === 'voted' && r.answer === opt).length;
                      return `${opt} ${n} 票`;
                    }).join(' · ')}
                  </p>
                )}
                {!loadingDetail && row.kind === 'vote' && respondents.some(r => r.status === 'voted') && (
                  <div style={{ margin: '0 0 8px' }}>
                    {rowOptions(row).map(opt => (
                      <StatBar
                        key={opt}
                        label={opt}
                        n={respondents.filter(r => r.status === 'voted' && r.answer === opt).length}
                        total={respondents.filter(r => r.status === 'voted').length}
                        unit="票"
                      />
                    ))}
                  </div>
                )}
                {!loadingDetail && row.kind === 'signup' && respondents.some(r => r.status === 'joined' || r.status === 'not_joined') && (
                  <div style={{ margin: '0 0 8px' }}>
                    <StatBar
                      label="参加"
                      n={respondents.filter(r => r.status === 'joined').length}
                      total={respondents.filter(r => r.status === 'joined' || r.status === 'not_joined').length}
                      unit="人"
                    />
                    <StatBar
                      label="不参加"
                      n={respondents.filter(r => r.status === 'not_joined').length}
                      total={respondents.filter(r => r.status === 'joined' || r.status === 'not_joined').length}
                      unit="人"
                    />
                  </div>
                )}
                {!loadingDetail && respondents.length > 0 && (
                  <div style={{ margin: '0 0 6px' }}>
                    <button type="button" className="mini ghost" onClick={() => void copyRespondents(row)}>复制名单</button>
                  </div>
                )}
                {!loadingDetail && respondents.map(r => (
                  <div key={r.user_id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderTop: '1px dashed rgba(34,49,74,.08)', fontSize: 13, color: '#22314a', flexWrap: 'wrap' }}>
                    <strong>{names[r.user_id] ?? '成员'}</strong>
                    <span>{statusLabel(row.kind, r.status)}</span>
                    {r.region && <span style={{ color: '#817669' }}>{r.region}</span>}
                    {r.answer && (r.status === 'voted' || r.status === 'submitted') && (
                      <span style={{ color: '#4a4438', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.status === 'voted' ? `投了「${r.answer}」` : r.answer}</span>
                    )}
                    <span style={{ color: '#817669' }}>{timeAgo(r.updated_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div style={rowBtn}>
          <button type="button" className="mini ghost" onClick={() => void load()}>刷新</button>
        </div>
      </div>

      {preview && (
        <div className="bc-overlay" role="dialog" aria-modal="true" style={{ zIndex: 1400 }} onClick={() => setPreview(false)}>
          <div className="bc-card" onClick={e => e.stopPropagation()}>
            <div className="bc-kicker">{PREVIEW_KICKER[kind] ?? '管理员广播'}</div>
            <h2 className="bc-title">{title.trim() || PREVIEW_DEFAULT_TITLE[kind] || '管理员消息'}</h2>
            {body.trim() && <p className="bc-body">{body}</p>}

            {kind === 'popup' && (
              <div className="bc-actions">
                <button type="button" className="bc-primary" onClick={() => setPreview(false)}>
                  {buttonLabel.trim() || '知道了'}
                </button>
              </div>
            )}

            {kind === 'location' && (
              <>
                <p className="bc-note">
                  同意后会弹出系统定位授权，只获取城市 / 地区（定位先粗化到约 10 公里），不会保存精确位置和街道地址。不同意也不会有任何影响。
                </p>
                <div className="bc-actions">
                  <button type="button" className="bc-primary" onClick={() => setPreview(false)}>同意并分享所在地区</button>
                  <button type="button" className="bc-ghost" onClick={() => setPreview(false)}>暂不分享</button>
                </div>
              </>
            )}

            {kind === 'vote' && (
              <>
                <div className="bc-vote">
                  {pvOptions.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      className={pvVote === opt ? 'bc-vote-opt bc-vote-opt-on' : 'bc-vote-opt'}
                      aria-pressed={pvVote === opt}
                      onClick={() => setPvVote(opt)}
                    >
                      <span className="bc-vote-dot" aria-hidden="true">{pvVote === opt ? '●' : '○'}</span>
                      {opt}
                    </button>
                  ))}
                </div>
                {pvOptions.length === 0 && <p className="bc-error">还没有填投票选项（在发布表单里一行一个填写）。</p>}
                <div className="bc-actions">
                  <button type="button" className="bc-primary" disabled={!pvVote} onClick={() => setPreview(false)}>提交投票</button>
                  <button type="button" className="bc-ghost" onClick={() => setPreview(false)}>暂不参与</button>
                </div>
              </>
            )}

            {kind === 'form' && (
              <>
                <textarea
                  className="bc-form-input"
                  value={pvForm}
                  onChange={e => setPvForm(e.target.value)}
                  placeholder="在这里填写…"
                  maxLength={500}
                  rows={4}
                />
                <div className="bc-actions">
                  <button type="button" className="bc-primary" disabled={pvForm.trim().length === 0} onClick={() => setPreview(false)}>提交</button>
                  <button type="button" className="bc-ghost" onClick={() => setPreview(false)}>暂不填写</button>
                </div>
              </>
            )}

            {kind === 'signup' && (
              <div className="bc-actions">
                <button type="button" className="bc-primary" onClick={() => setPreview(false)}>报名参加</button>
                <button type="button" className="bc-ghost" onClick={() => setPreview(false)}>不参加</button>
              </div>
            )}

            {kind === 'refresh' && (
              <>
                <p className="bc-note">成员端不会弹窗，页面只会自动刷新一次到最新版本，谁刷新了会记在回执名单里。</p>
                <div className="bc-actions">
                  <button type="button" className="bc-primary" onClick={() => setPreview(false)}>关闭预览</button>
                </div>
              </>
            )}

            <p style={{ ...mut, margin: '12px 0 0', textAlign: 'center' }}>仅预览效果，不会真的发送、不会记录任何回执。</p>
          </div>
        </div>
      )}
    </div>
  );
}
