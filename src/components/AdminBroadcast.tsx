import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { card, h3, mut, rowBtn, alog, timeAgo } from '../pages/admin/shared';
import { confirmDialog } from '../lib/dialog';
import OptionSheet from './OptionSheet';

const KIND_OPTIONS = [
  { value: 'popup', label: '普通弹窗' },
  { value: 'location', label: '位置征集弹窗' },
  { value: 'vote', label: '投票征集弹窗' },
  { value: 'form', label: '填写征集弹窗' },
  { value: 'signup', label: '报名弹窗' },
];
const AUDIENCE_OPTIONS = [
  { value: 'all', label: '全部成员' },
  { value: 'app', label: '仅软件版' },
  { value: 'web', label: '仅网页版' },
];
const EXP_OPTIONS = [
  { value: '0', label: '不过期' },
  { value: '1', label: '1 天' },
  { value: '3', label: '3 天' },
  { value: '7', label: '7 天' },
];
const SHEET_BTN = { padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(34,49,74,.25)', background: '#fff', color: '#22314a', fontSize: 13.5 } as const;

const KIND_LABEL: Record<string, string> = { popup: '普通弹窗', location: '位置征集', vote: '投票征集', form: '填写征集', signup: '报名' };
const AUDIENCE_LABEL: Record<string, string> = { all: '全部', app: '仅软件版', web: '仅网页版' };
const STATUS_LABEL: Record<string, string> = {
  seen: '已读', declined: '暂不分享', shared: '已共享', denied: '系统未授权',
  voted: '已投票', submitted: '已填写', joined: '参加', not_joined: '不参加',
};

function statusLabel(kind: string, status: string): string {
  if (status === 'declined') return kind === 'location' ? '暂不分享' : '暂不参与';
  return STATUS_LABEL[status] ?? status;
}

type BroadcastRow = {
  id: number; kind: string; title: string; body: string; button_label: string;
  audience: string; created_at: string; expires_at: string | null; revoked: boolean;
  options: unknown;
};
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

  const load = useCallback(async () => {
    const { data } = await supabase.from('admin_broadcasts')
      .select('id, kind, title, body, button_label, audience, created_at, expires_at, revoked, options')
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
    setBusy(true);
    const days = parseInt(exp, 10);
    const { error } = await supabase.from('admin_broadcasts').insert({
      kind,
      title: t || (kind === 'location' ? '位置共享邀请' : ''),
      body: b,
      button_label: kind === 'popup' ? (buttonLabel.trim() || '知道了') : '知道了',
      audience,
      created_by: me,
      options: voteOpts,
      expires_at: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null,
    });
    setBusy(false);
    if (error) { setMsg('发布失败：' + error.message); return; }
    await alog('broadcast_post', { kind, audience, exp_days: days });
    setTitle(''); setBody(''); setButtonLabel('知道了'); setOptionsText(''); setExp('0');
    setMsg(`${KIND_LABEL[kind]}已发布，成员打开网站时就会弹窗`);
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

  function stateOf(row: BroadcastRow): string {
    if (row.revoked) return '已撤回';
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return '已过期';
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

  return (
    <div>
      <div style={card}>
        <h3 style={h3}>发布弹窗</h3>
        <p style={mut}>
          普通弹窗：弹一次，点按钮记已读。位置征集：成员自愿共享城市 / 地区，本人点同意才定位，不存精确位置。投票征集：成员选一项，后台看票数和名单。填写征集：成员填一段文字提交。报名：成员选参加 / 不参加，后台自动统计。五种都能选可见范围和有效期、能撤回，每人只弹一次。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          <OptionSheet value={kind} options={KIND_OPTIONS} onChange={setKind} buttonText={KIND_LABEL[kind]} title="弹窗类型" buttonStyle={SHEET_BTN} />
          <OptionSheet value={audience} options={AUDIENCE_OPTIONS} onChange={setAudience} buttonText={AUDIENCE_LABEL[audience]} title="可见范围" buttonStyle={SHEET_BTN} />
          <OptionSheet value={exp} options={EXP_OPTIONS} onChange={setExp} buttonText={EXP_OPTIONS.find(o => o.value === exp)?.label ?? '不过期'} title="有效期" buttonStyle={SHEET_BTN} />
        </div>
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
            {busy ? '发布中…' : '发布'}
          </button>
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
              {!row.revoked && (
                <button type="button" className="mini ghost" onClick={() => void revoke(row)}>撤回</button>
              )}
            </div>
            {row.body && <p style={{ ...mut, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{row.body}</p>}
            {row.kind === 'vote' && rowOptions(row).length > 0 && (
              <p style={{ ...mut, margin: '4px 0 0' }}>选项：{rowOptions(row).join(' / ')}</p>
            )}
            <p style={{ ...mut, margin: '4px 0 0' }}>{countText(row)}</p>
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
    </div>
  );
}
