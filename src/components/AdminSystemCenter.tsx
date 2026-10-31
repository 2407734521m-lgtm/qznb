import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { startSitePresence, type SitePresenceSnapshot } from '../lib/sitePresence';

type CheckStatus = 'ok' | 'warn' | 'error';
type Check = { key: string; label: string; status: CheckStatus; detail: string };
type AuditRow = { id: number; actor: string | null; action: string; created_at: string; detail: unknown };
type Dashboard = {
  loadedAt: string;
  dbOk: boolean;
  dbMs: number;
  role: string;
  roleOk: boolean;
  sessionOk: boolean;
  settingsOk: boolean;
  auditOk: boolean;
  activityOk: boolean;
  activeCount: number | null;
  criticalCount: number | null;
  maintenance: string;
  nextMaintenance: string;
  checks: Check[];
  audit: AuditRow[];
  latestExport: { status: string; scope: string; created_at: string; note: string | null } | null;
};

const panel: React.CSSProperties = {
  background: 'linear-gradient(145deg,rgba(24,34,56,.88),rgba(13,20,36,.94))',
  border: '1px solid rgba(190,210,255,.13)', borderRadius: 20,
  padding: 16, marginBottom: 14, boxShadow: '0 12px 30px rgba(0,0,0,.18)', color: '#edf3ff',
};
const muted: React.CSSProperties = { color: '#9aa9c4', fontSize: 12.5, lineHeight: 1.6 };
const button: React.CSSProperties = {
  border: '1px solid rgba(190,210,255,.18)', borderRadius: 12, padding: '10px 13px', minHeight: 40,
  background: 'rgba(255,255,255,.08)', color: '#edf3ff', fontWeight: 650, cursor: 'pointer',
};
const highRiskActions = [
  'setting_change', 'member_ban', 'member_unban', 'set_role',
  'maintenance_codes_revoked', 'notice_purge', 'comment_purge',
  'database_export', 'invite_delete', 'invite_toggle',
];
const actionNames: Record<string, string> = {
  setting_change: '修改全站设置',
  member_ban: '封禁成员',
  member_unban: '解除封禁',
  set_role: '修改成员角色',
  maintenance_codes_revoked: '撤销维护通行码',
  maintenance_code_created: '生成维护通行码',
  maintenance_schedule_saved: '设置定时维护',
  maintenance_schedule_cleared: '取消定时维护',
  notice_purge: '永久删除公告',
  comment_purge: '永久删除评论',
  database_export: '导出业务数据',
  invite_delete: '删除邀请码',
  invite_toggle: '启停邀请码',
  health_check: '运行健康检查',
};
const statusNames: Record<CheckStatus, string> = { ok: '正常', warn: '需核实', error: '异常' };

function csvCell(value: unknown) {
  const s = String(value ?? '');
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadFile(filename: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function formatTime(value: string | null | undefined) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString();
}
function parseMaintenance(settings: Map<string, string>) {
  const manual = settings.get('maintenance') === 'true';
  const raw = settings.get('maintenance_schedule');
  if (raw) {
    try {
      const schedule = JSON.parse(raw) as { enabled?: boolean; start_at?: string | null; end_at?: string | null };
      if (schedule.enabled) {
        const start = schedule.start_at ? new Date(schedule.start_at) : null;
        const end = schedule.end_at ? new Date(schedule.end_at) : null;
        if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return { label: '定时计划配置异常', next: '请到全站设置检查计划时间' };
        }
        const now = Date.now();
        if (start.getTime() <= now && end.getTime() > now) {
          return { label: '计划维护进行中', next: '预计结束：' + end.toLocaleString() };
        }
        if (start.getTime() > now) {
          return { label: '已排期，尚未开始', next: '计划开始：' + start.toLocaleString() };
        }
        return { label: '计划时段已结束', next: '计划结束：' + end.toLocaleString() };
      }
    } catch {
      return { label: '维护计划读取异常', next: '请到全站设置重新检查计划' };
    }
  }
  return manual
    ? { label: '手动维护已开启', next: '关闭时间由管理员手动控制' }
    : { label: '正常开放', next: '当前没有生效的维护计划' };
}

function StatCard({ label, value, detail, tone = 'neutral' }: {
  label: string; value: string; detail: string; tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const color = tone === 'good' ? '#75e0a5' : tone === 'warn' ? '#ffd18a' : tone === 'bad' ? '#ff929e' : '#dce7ff';
  return <div style={{
    minWidth: 0, padding: 13, borderRadius: 16,
    background: 'rgba(255,255,255,.045)', border: '1px solid rgba(190,210,255,.11)',
  }}>
    <div style={{ color: '#98a8c5', fontSize: 11.5 }}>{label}</div>
    <div style={{ color, fontSize: 21, fontWeight: 800, letterSpacing: '-.4px', margin: '5px 0 2px', overflowWrap: 'anywhere' }}>{value}</div>
    <div style={{ color: '#8292af', fontSize: 10.5, lineHeight: 1.45 }}>{detail}</div>
  </div>;
}

function StatusPill({ status }: { status: CheckStatus }) {
  const color = status === 'ok' ? '#78e0a4' : status === 'warn' ? '#ffd18a' : '#ff929e';
  const bg = status === 'ok' ? 'rgba(42,180,111,.12)' : status === 'warn' ? 'rgba(240,170,55,.12)' : 'rgba(240,85,105,.12)';
  return <span style={{ color, background: bg, border: '1px solid ' + color + '35', borderRadius: 999, padding: '3px 8px', fontSize: 10.5, fontWeight: 750, whiteSpace: 'nowrap' }}>
    {statusNames[status]}
  </span>;
}

export default function AdminSystemCenter({ setMsg, go }: {
  setMsg: (s: string) => void;
  go: (tab: string) => void;
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [presence, setPresence] = useState<SitePresenceSnapshot>({
    status: 'connecting', online: null, updatedAt: null,
  });
  const loadingRef = useRef(false);
  useEffect(() => startSitePresence(next => setPresence(next)), []);

  async function refresh(silent = false) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) { setBusy(true); setMsg(''); }
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const dbStarted = Date.now();
      const dbTask = supabase.from('profiles').select('id', { count: 'exact', head: true })
        .then(result => ({ ...result, responseMs: Date.now() - dbStarted }));
      const [db, roleResult, authResult, settingsResult, auditResult, criticalResult, activityResult, exportResult] = await Promise.all([
        dbTask,
        supabase.rpc('my_role'),
        supabase.auth.getSession(),
        supabase.from('site_settings').select('key, value').in('key', ['maintenance', 'maintenance_schedule']),
        supabase.from('admin_audit_logs').select('id, actor, action, created_at, detail')
          .order('created_at', { ascending: false }).limit(8),
        supabase.from('admin_audit_logs').select('id', { count: 'exact', head: true })
          .gte('created_at', since24h).in('action', highRiskActions),
        supabase.rpc('admin_presence_summary'),
        supabase.from('backup_logs').select('status, scope, created_at, note')
          .order('created_at', { ascending: false }).limit(1),
      ]);

      const settings = new Map((settingsResult.data ?? []).map(row => [row.key, row.value]));
      const maintenance = parseMaintenance(settings);
      const activity = activityResult.data as { active_count?: number } | null;
      const role = typeof roleResult.data === 'string' ? roleResult.data : '未知';
      const audit = (auditResult.data ?? []) as AuditRow[];
      const latest = exportResult.data?.[0] ?? null;
      const dbOk = !db.error;
      const roleOk = !roleResult.error && role === 'super_admin';
      const sessionOk = !authResult.error && Boolean(authResult.data.session);
      const settingsOk = !settingsResult.error;
      const auditOk = !auditResult.error;
      const activityOk = !activityResult.error;

      const checks: Check[] = [
        {
          key: 'database', label: '数据库连接', status: dbOk ? 'ok' : 'error',
          detail: dbOk ? '只读探测成功，响应约 ' + db.responseMs + ' ms。' : 'profiles 只读探测失败：' + db.error.message,
        },
        {
          key: 'permission', label: '超级管理员权限', status: roleOk ? 'ok' : roleResult.error ? 'error' : 'warn',
          detail: roleResult.error ? '角色验证 RPC 失败：' + roleResult.error.message : '服务端角色结果：' + role + '。',
        },
        {
          key: 'session', label: '管理员登录会话', status: sessionOk ? 'ok' : 'error',
          detail: authResult.error ? authResult.error.message : sessionOk ? '当前会话有效。' : '没有读取到有效登录会话。',
        },
        {
          key: 'audit', label: '管理员审计日志', status: auditOk ? 'ok' : 'error',
          detail: auditOk ? '审计日志读取成功，最近读取 ' + audit.length + ' 条。' : '审计日志读取失败：' + auditResult.error.message,
        },
        {
          key: 'settings', label: '全站设置读取', status: settingsOk ? 'ok' : 'warn',
          detail: settingsOk ? '维护开关与计划配置可读取。' : '设置读取失败：' + settingsResult.error.message,
        },
        {
          key: 'activity', label: '活跃账号统计', status: activityOk ? 'ok' : 'warn',
          detail: activityOk ? '服务端活动窗口统计可用。' : '统计 RPC 暂不可用；不影响实时 Presence 连接计数。',
        },
      ];

      setDashboard({
        loadedAt: new Date().toISOString(),
        dbOk, dbMs: db.responseMs, role, roleOk, sessionOk, settingsOk, auditOk,
        activityOk,
        activeCount: activityOk && typeof activity?.active_count === 'number' ? activity.active_count : null,
        criticalCount: criticalResult.error ? null : criticalResult.count ?? 0,
        maintenance: maintenance.label,
        nextMaintenance: maintenance.next,
        checks,
        audit,
        latestExport: latest ? {
          status: String(latest.status ?? 'unknown'),
          scope: String(latest.scope ?? '—'),
          created_at: String(latest.created_at ?? ''),
          note: latest.note ?? null,
        } : null,
      });
      if (!silent) setMsg('系统巡检完成。请查看数据库、会话、权限和审计状态。');
    } catch (error) {
      if (!silent) setMsg('系统巡检失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      loadingRef.current = false;
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  async function exportMembers() {
    setExportBusy(true); setMsg('');
    try {
      const { data, error } = await supabase.from('profiles')
        .select('id, username, display_name, role, joined, created_at')
        .order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      const rows: unknown[][] = [
        ['用户 ID', '用户名', '显示名称', '角色', '已加入', '注册时间'],
        ...(data ?? []).map(r => [r.id, r.username, r.display_name, r.role, r.joined, r.created_at]),
      ];
      downloadFile(
        'class-members-' + new Date().toISOString().slice(0, 10) + '.csv',
        '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'),
        'text/csv;charset=utf-8;',
      );
      setMsg('已导出 ' + (data?.length ?? 0) + ' 条基础成员记录。文件包含用户标识与昵称，请妥善保管。');
    } catch (error) {
      setMsg('导出失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setExportBusy(false);
    }
  }

  function exportReport() {
    if (!dashboard) return;
    const report = {
      format: 'qznb-admin-health-report-v1',
      generated_at: new Date().toISOString(),
      site: window.location.origin,
      checks: dashboard.checks,
      metrics: {
        database: { available: dashboard.dbOk, response_ms: dashboard.dbMs },
        administrator: { session_valid: dashboard.sessionOk, role: dashboard.role },
        realtime: { status: presence.status, connections: presence.status === 'connected' ? presence.online : null },
        active_accounts_window: dashboard.activeCount,
        high_risk_admin_actions_24h: dashboard.criticalCount,
        maintenance: dashboard.maintenance,
        latest_data_export: dashboard.latestExport,
      },
      limitations: [
        '浏览器侧探测不代表数据库完整性或全部 RLS 隔离测试。',
        '当前报告不包含服务器 CPU、内存、磁盘、真实备份快照或登录失败明细。',
        '实时连接数是 Presence 连接数，不等于去重后的自然人数。',
      ],
    };
    downloadFile(
      'qznb-system-report-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify(report, null, 2),
      'application/json;charset=utf-8;',
    );
    setMsg('系统巡检报告已导出；报告不包含成员邮箱、联系方式或个人资料。');
  }

  const realtimeTone: CheckStatus = presence.status === 'connected' ? 'ok' : presence.status === 'connecting' ? 'warn' : 'error';
  const maintenanceTone: CheckStatus = dashboard?.maintenance.includes('维护进行中') || dashboard?.maintenance.includes('手动维护已开启') ? 'warn'
    : dashboard?.maintenance.includes('异常') ? 'error' : 'ok';

  return <div style={{ color: '#edf3ff' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 23, fontWeight: 850, letterSpacing: '-.7px' }}>超级管理中心</div>
        <div style={{ ...muted, marginTop: 4 }}>实时运行监控、安全审计与全站运维入口</div>
        <div style={{ ...muted, marginTop: 3, fontSize: 10.5 }}>
          {dashboard ? '最近更新：' + formatTime(dashboard.loadedAt) + ' · 每 30 秒刷新' : '正在连接监控数据…'}
        </div>
      </div>
      <button type="button" style={button} disabled={busy} onClick={() => void refresh(false)}>
        {busy ? '巡检中…' : '立即巡检'}
      </button>
    </div>

    <section style={panel}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 11 }}>实时运行状态</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(138px,1fr))', gap: 9 }}>
        <StatCard
          label="实时在线连接"
          value={presence.status === 'connected' && presence.online !== null ? String(presence.online) : '—'}
          detail={presence.status === 'connected' ? 'Realtime Presence · 含多设备/多标签页连接' : '实时通道：' + presence.status}
          tone={realtimeTone}
        />
        <StatCard
          label="近 30 分钟活跃账号"
          value={dashboard?.activeCount === null || dashboard?.activeCount === undefined ? '—' : String(dashboard.activeCount)}
          detail="服务端活动窗口统计，不等同于实时在线"
          tone={dashboard?.activityOk ? 'good' : 'warn'}
        />
        <StatCard
          label="数据库响应"
          value={dashboard ? (dashboard.dbOk ? dashboard.dbMs + ' ms' : '异常') : '—'}
          detail="profiles 只读探测往返时间"
          tone={dashboard ? (dashboard.dbOk ? dashboard.dbMs < 1200 ? 'good' : 'warn' : 'bad') : 'neutral'}
        />
        <StatCard
          label="管理员会话"
          value={dashboard ? (dashboard.sessionOk ? '有效' : '失效') : '—'}
          detail={dashboard ? '服务端角色：' + dashboard.role : '等待权限核验'}
          tone={dashboard ? (dashboard.sessionOk && dashboard.roleOk ? 'good' : 'bad') : 'neutral'}
        />
      </div>
      <div style={{ ...muted, marginTop: 10 }}>
        在线数字来自独立 Presence 通道；同一账号多设备或多标签页可能计为多个连接，不代表去重人数。
      </div>
    </section>

    <section style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>安全巡检</div>
        <span style={{ ...muted, fontSize: 10.5 }}>全部为只读检查</span>
      </div>
      {!dashboard && <p style={muted}>正在读取数据库、管理员权限与审计状态…</p>}
      {dashboard?.checks.map(check => (
        <div key={check.key} style={{ padding: '10px 0', borderTop: '1px solid rgba(190,210,255,.10)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <strong style={{ fontSize: 12.5 }}>{check.label}</strong>
            <StatusPill status={check.status} />
          </div>
          <div style={{ ...muted, marginTop: 4, overflowWrap: 'anywhere' }}>{check.detail}</div>
        </div>
      ))}
      {dashboard && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" style={button} onClick={exportReport}>导出巡检报告</button>
        <button type="button" style={button} onClick={() => go('logs')}>查看完整审计日志</button>
      </div>}
    </section>

    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>维护状态</div>
        {dashboard && <StatusPill status={maintenanceTone} />}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>{dashboard?.maintenance ?? '读取中…'}</div>
      <div style={{ ...muted, marginTop: 3 }}>{dashboard?.nextMaintenance ?? '正在读取维护配置'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" style={button} onClick={() => go('settings')}>维护计划与全站设置</button>
        <button type="button" style={button} onClick={() => go('settings')}>临时通行码管理</button>
      </div>
    </section>

    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>高风险操作审计</div>
        <span style={{ color: '#ffd18a', fontSize: 11, fontWeight: 750 }}>
          近 24 小时：{dashboard?.criticalCount === null || dashboard?.criticalCount === undefined ? '暂不可用' : dashboard.criticalCount + ' 次'}
        </span>
      </div>
      {dashboard?.audit.map(entry => (
        <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderTop: '1px solid rgba(190,210,255,.10)' }}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: highRiskActions.includes(entry.action) ? '#ffb86c' : '#6f9dff', flexShrink: 0, marginTop: 6 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 750 }}>{actionNames[entry.action] || entry.action}</div>
            <div style={{ ...muted, fontSize: 10.5 }}>{formatTime(entry.created_at)} · 管理员操作</div>
          </div>
          {highRiskActions.includes(entry.action) && <span style={{ color: '#ffd18a', fontSize: 10, whiteSpace: 'nowrap' }}>重点关注</span>}
        </div>
      ))}
      {dashboard && dashboard.audit.length === 0 && <p style={muted}>暂时没有审计记录。</p>}
      <button type="button" style={{ ...button, marginTop: 10 }} onClick={() => go('logs')}>打开操作日志</button>
    </section>

    <section style={panel}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>数据导出记录</div>
      {dashboard?.latestExport ? <>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          最近一次记录：{dashboard.latestExport.status === 'ok' ? '导出完成' : dashboard.latestExport.status === 'fail' ? '导出失败' : dashboard.latestExport.status}
        </div>
        <div style={{ ...muted, marginTop: 4 }}>{formatTime(dashboard.latestExport.created_at)} · {dashboard.latestExport.scope}</div>
        {dashboard.latestExport.note && <div style={{ ...muted, marginTop: 4, overflowWrap: 'anywhere' }}>{dashboard.latestExport.note}</div>}
      </> : <p style={muted}>暂未读取到数据导出记录。</p>}
      <p style={{ ...muted, margin: '10px 0 0' }}>
        这里展示的是后台业务数据导出记录，不代表 Supabase 自动备份或可恢复快照。真正灾备状态需在 Supabase 项目端核验。
      </p>
    </section>

    <section style={panel}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>快捷管理入口</div>
      <p style={muted}>这些入口会打开已有管理模块，不会创建重复的控制开关。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>
        <button type="button" style={button} onClick={() => go('accounts')}>账号与会话管理</button>
        <button type="button" style={button} onClick={() => go('moderate')}>内容审核与举报</button>
        <button type="button" style={button} onClick={() => go('notifications')}>全站通知中心</button>
        <button type="button" style={button} onClick={() => go('settings')}>全站设置与维护</button>
        <button type="button" style={button} onClick={() => go('logs')}>管理员操作日志</button>
      </div>
    </section>

    <section style={panel}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>成员数据导出</div>
      <p style={muted}>最多导出 5,000 条基础成员资料，包含用户 ID、用户名、显示名称和角色；不包含邮箱、联系方式、照片地址或个人简介。</p>
      <button type="button" style={button} disabled={exportBusy} onClick={() => void exportMembers()}>
        {exportBusy ? '正在导出…' : '导出成员 CSV'}
      </button>
      <p style={{ ...muted, marginBottom: 0 }}>文件包含可识别的成员资料，请仅用于必要的管理工作并妥善保管。</p>
    </section>

    <section style={{ ...panel, borderColor: 'rgba(255,190,110,.18)' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#ffd18a' }}>监控范围说明</div>
      <p style={{ ...muted, marginBottom: 0 }}>
        此面板可验证当前管理员会话、角色 RPC、数据库只读请求、审计表、维护配置和 Presence 连接。浏览器端无法证明全部 RLS 隔离正确，也不能直接读取服务器 CPU、内存、磁盘、登录失败明细或 Supabase 自动备份快照；这些项目不会被伪装成“正常”。
      </p>
    </section>
  </div>;
}
