import { useState } from 'react';
import { supabase } from '../lib/supabase';

type Check = { label: string; status: 'ok' | 'warn' | 'error'; detail: string };

const panel: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20,
  padding: 16, marginBottom: 14, boxShadow: '0 4px 18px rgba(15,23,42,.045)', color: '#111827',
};
const muted: React.CSSProperties = { color: '#6b7280', fontSize: 13, lineHeight: 1.55 };
const button: React.CSSProperties = {
  border: 0, borderRadius: 12, padding: '11px 14px', minHeight: 42,
  background: '#111827', color: '#fff', fontWeight: 650, cursor: 'pointer',
};

function csvCell(value: unknown) {
  const s = String(value ?? '');
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminSystemCenter({ setMsg }: { setMsg: (s: string) => void }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  async function runChecks() {
    setBusy(true); setMsg('');
    const started = Date.now();
    const next: Check[] = [];
    const probes: [string, () => Promise<any>][] = [
      ['成员资料表 profiles', () => supabase.from('profiles').select('id', { count: 'exact', head: true })],
      ['举报表 reports', () => supabase.from('reports').select('id', { count: 'exact', head: true })],
      ['资料隐私设置表 profile_privacy', () => supabase.from('profile_privacy').select('profile_id', { count: 'exact', head: true })],
      ['管理员角色 RPC my_role', () => supabase.rpc('my_role')],
    ];
    for (const [label, probe] of probes) {
      try {
        const result = await probe();
        if (result.error) {
          next.push({ label, status: 'warn', detail: '请求失败或当前账号无读取权限：' + result.error.message });
        } else {
          next.push({ label, status: 'ok', detail: '请求成功。此结果只代表当前账号可访问该接口。' });
        }
      } catch {
        next.push({ label, status: 'error', detail: '请求异常，请检查网络或 Supabase 配置。' });
      }
    }
    next.push({
      label: '隐私隔离 / RLS 强制检查',
      status: 'warn',
      detail: '仅凭前端探测无法证明普通成员无法读取隐藏资料；需单独用普通账号验证数据库 RLS 与成员查询。',
    });
    next.push({
      label: '后端运行状态',
      status: 'warn',
      detail: '浏览器无法检查服务器 CPU、内存、备份计划或服务端日志；需配置受保护的服务端监控接口。',
    });
    setChecks(next);
    setCheckedAt(new Date().toLocaleString());
    setMsg('检查完成，用时约 ' + (Date.now() - started) + ' ms；请查看各项结果。');
    setBusy(false);
  }

  async function exportMembers() {
    setExportBusy(true); setMsg('');
    try {
      const { data, error } = await supabase.from('profiles')
        .select('id, username, display_name, role, joined, created_at')
        .order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      const rows: unknown[][] = [
        ['用户 ID', '用户名', '显示名称', '角色', '已加入', '注册时间'],
        ...(data ?? []).map((r: any) => [r.id, r.username, r.display_name, r.role, r.joined, r.created_at]),
      ];
      downloadCsv('class-members-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
      setMsg('已导出 ' + (data?.length ?? 0) + ' 条成员记录。导出文件包含个人信息，请妥善保管。');
    } catch (e: any) {
      setMsg('导出失败：' + (e?.message || '未知错误'));
    } finally {
      setExportBusy(false);
    }
  }

  const statusText = (s: Check['status']) => s === 'ok' ? '请求成功' : s === 'warn' ? '需核实' : '异常';
  const statusColor = (s: Check['status']) => s === 'ok' ? '#166534' : s === 'warn' ? '#92400e' : '#991b1b';

  return <div style={{ color: '#111827' }}>
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.6px' }}>安全与系统</div>
      <div style={{ ...muted, marginTop: 5 }}>检查数据访问、查看隐私风险，并导出基础成员清单。</div>
    </div>

    <section style={panel}>
      <div style={{ fontSize: 16, fontWeight: 750 }}>系统检查</div>
      <p style={muted}>使用当前管理员会话执行只读探测，不会修改或删除数据库数据。</p>
      <button style={button} disabled={busy} onClick={runChecks}>{busy ? '检查中…' : '运行检查'}</button>
      {checkedAt && <div style={{ ...muted, marginTop: 10 }}>最近检查：{checkedAt}</div>}
      {checks.map((c, i) => <div key={c.label} style={{ padding: '12px 0', borderTop: '1px solid #eef0f4', marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>{c.label}</strong>
          <span style={{ color: statusColor(c.status), fontSize: 11, fontWeight: 750, whiteSpace: 'nowrap' }}>{statusText(c.status)}</span>
        </div>
        <div style={{ ...muted, marginTop: 4 }}>{c.detail}</div>
      </div>)}
    </section>

    <section style={panel}>
      <div style={{ fontSize: 16, fontWeight: 750 }}>成员数据导出</div>
      <p style={muted}>导出最多 5,000 条基础成员信息为 CSV。不包含邮箱、联系方式、照片地址或个人简介。</p>
      <button style={button} disabled={exportBusy} onClick={exportMembers}>{exportBusy ? '正在导出…' : '导出成员 CSV'}</button>
      <p style={{ ...muted, marginBottom: 0 }}>请只在有管理需要时导出，并避免把文件发到公开群聊。</p>
    </section>

    <section style={panel}>
      <div style={{ fontSize: 16, fontWeight: 750 }}>备份与权限说明</div>
      <p style={muted}>此版本没有执行数据库备份，也不会显示“备份成功”。正式备份应在 Supabase 项目端配置并验证恢复流程。</p>
      <p style={muted}>此面板仅向超级管理员展示，但最终权限仍由 AdminRoute、数据库 RLS 与受保护的 RPC 决定。不要把浏览器中的可见性开关当作安全边界。</p>
    </section>
  </div>;
}
