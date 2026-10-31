import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut } from './shared';

type Log = { id: number; actor: string | null; action: string; target: string | null; detail: unknown; created_at: string };

// 已知操作代码的中文名（前端 alog 与后端函数写下的主要类型）；未收录的显示原代码。
const ACTION_LABELS: Record<string, string> = {
  setting_change: '修改全站设置',
  report_handle: '处理举报',
  post_delete: '删除动态',
  notice_post: '发布公告',
  notice_popup_set: '设置公告弹窗',
  notice_hide: '隐藏公告',
  maintenance_schedule_saved: '设置定时维护',
  maintenance_schedule_cleared: '清除定时维护',
  maintenance_code_created: '生成临时通行码',
  maintenance_codes_revoked: '撤销临时通行码',
  invite_toggle: '启停邀请码',
  invite_delete: '删除邀请码',
  invite_batch: '批量生成邀请码',
  invite_add: '新增邀请码',
  health_check: '健康检查',
  game_revoke: '撤销段位认证',
  feedback_reply: '回复反馈',
  feedback_mark: '标记反馈',
  feedback_delete: '删除反馈',
  event_delete: '删除活动',
  event_add: '新增活动',
  backup: '导出备份',
  set_role: '修改成员角色',
  set_joined: '设置入班状态',
  admin_update_profile: '管理员修改资料',
  member_ban: '封禁成员',
  member_unban: '解封成员',
};

// detail 里常见字段的中文名；未收录的显示原字段名。
const KEY_LABELS: Record<string, string> = {
  id: '编号', code: '邀请码', len: '内容长度', popup_times: '弹窗次数', times: '次数',
  title: '标题', done: '已处理', pid: '成员编号', n: '数量', active: '启用',
  valid_minutes: '有效分钟', max_uses: '可用次数', result: '处理结果', note: '备注',
  key: '设置项', value: '新值', start_at: '开始时间', end_at: '结束时间', scope: '范围',
  approve: '是否通过', role: '角色', name: '名称', email: '邮箱', status: '状态',
  reason: '原因', count: '数量', minutes: '分钟', ip: 'IP', device: '设备',
};

const actionLabel = (a: string) => ACTION_LABELS[a] || a;
const keyLabel = (k: string) => KEY_LABELS[k] || k;

// 把 detail 递归摊平成「字段 → 值」的行：嵌套对象用 · 连接路径，数组合并成一行，
// 管理员在手机上不用再读整块 JSON。
function flatten(value: unknown, prefix: string, out: [string, string][], depth: number) {
  if (value === null || value === undefined) { out.push([prefix || '内容', '—']); return; }
  if (Array.isArray(value)) {
    if (value.length === 0) { out.push([prefix || '内容', '（空）']); return; }
    if (value.every(v => v === null || typeof v !== 'object')) {
      out.push([prefix || '内容', value.map(v => String(v ?? '—')).join('、')]);
      return;
    }
    if (depth < 2) { value.forEach((v, i) => flatten(v, prefix ? `${prefix} ${i + 1}` : `第 ${i + 1} 项`, out, depth + 1)); return; }
    out.push([prefix || '内容', `共 ${value.length} 项`]);
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) { out.push([prefix || '内容', '（无）']); return; }
    entries.forEach(([k, v]) => flatten(v, prefix ? `${prefix} · ${keyLabel(k)}` : keyLabel(k), out, depth));
    return;
  }
  out.push([prefix || '内容', String(value)]);
}

function detailRows(detail: unknown): [string, string][] {
  let value: unknown = detail ?? {};
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return [['内容', String(detail)]]; } }
  const out: [string, string][] = [];
  flatten(value, '', out, 0);
  return out.slice(0, 30);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => {
    supabase.from('admin_audit_logs').select('id, actor, action, target, detail, created_at')
      .order('created_at', { ascending: false }).limit(100)
      .then(async ({ data }) => {
        const rows = (data ?? []) as Log[];
        setLogs(rows);
        const ids = [...new Set(rows.flatMap(l => [l.actor, l.target]).filter((x): x is string => !!x && UUID_RE.test(x)))];
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, username, display_name').in('id', ids);
          const map: Record<string, string> = {};
          (profs || []).forEach(p => { map[p.id] = p.display_name || p.username || p.id; });
          setNames(map);
        }
      });
  }, []);

  const actionCounts = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach(l => map.set(l.action, (map.get(l.action) || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs]);

  const shown = logs.filter(l => {
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    if (!q) return true;
    const needle = q.toLowerCase();
    const hay = [l.action, actionLabel(l.action), JSON.stringify(l.detail ?? ''), l.actor ? names[l.actor] : '', l.target ? names[l.target] : '']
      .join(' ').toLowerCase();
    return hay.includes(needle);
  });

  const personName = (id: string | null) => (id ? names[id] || id : '');

  return (
    <div style={card}>
      <h3 style={h3}>操作日志（{shown.length}）</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button className={'mini' + (actionFilter === 'all' ? '' : ' ghost')} onClick={() => setActionFilter('all')}>全部 {logs.length}</button>
        {actionCounts.map(([a, n]) => (
          <button key={a} className={'mini' + (actionFilter === a ? '' : ' ghost')} onClick={() => setActionFilter(a)}>
            {actionLabel(a)} {n}
          </button>
        ))}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索内容、操作人…" style={{ marginBottom: 10 }} />
      {shown.map(l => (
        <div key={l.id} style={{ fontSize: 12.5, padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
          <span style={mut}>{(l.created_at || '').slice(0, 16).replace('T', ' ')}</span>
          <div><b>{actionLabel(l.action)}</b>{actionLabel(l.action) !== l.action && <span style={{ ...mut, marginLeft: 6 }}>{l.action}</span>}</div>
          {(l.actor || l.target) && (
            <div style={{ ...mut, marginTop: 2 }}>
              {l.actor && <>操作人：<span style={{ color: '#d7dce5' }}>{personName(l.actor)}</span></>}
              {l.actor && l.target && ' · '}
              {l.target && <>对象：<span style={{ color: '#d7dce5' }}>{personName(l.target)}</span></>}
            </div>
          )}
          <div style={{ marginTop: 6, display: 'grid', gap: 5 }}>
            {detailRows(l.detail).map(([key, value], i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(76px, 110px) minmax(0, 1fr)', gap: 8, lineHeight: 1.55 }}>
                <span style={mut}>{key}</span>
                <span style={{ color: '#d7dce5', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {shown.length === 0 && <p style={mut}>暂无记录</p>}
      <p style={{ ...mut, marginTop: 10 }}>日志仅管理员可见，不可删除或修改。</p>
    </div>
  );
}
