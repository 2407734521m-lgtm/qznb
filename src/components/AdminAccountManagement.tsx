import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { confirmDialog, promptDialog } from '../lib/dialog';
import { alog } from '../pages/admin/shared';
import AdminMemberModal from './AdminMemberModal';

type Account = {
  id: string;
  username: string;
  display_name: string | null;
  real_name: string | null;
  role: string;
  joined: boolean;
  created_at: string;
  email: string | null;
  last_sign_in_at: string | null;
  location: string | null;
  device: string | null;
  presence_updated_at: string | null;
};

const panel: React.CSSProperties = {
  background: 'linear-gradient(145deg,#171e33,#0d1222)',
  border: '1px solid #ffffff18', borderRadius: 16, padding: 14, marginBottom: 10,
};
const muted: React.CSSProperties = { color: '#98a4c4', fontSize: 11.5, lineHeight: 1.7 };
const btn: React.CSSProperties = {
  border: '1px solid #ffffff20', borderRadius: 9, padding: '7px 10px',
  background: '#ffffff0d', color: '#eef0ff', fontSize: 12, cursor: 'pointer',
};

function stamp(value: string | null) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '暂无记录' : date.toLocaleString();
}

export default function AdminAccountManagement({
  me, isSuper, setMsg,
}: { me: string; isSuper: boolean; setMsg: (message: string) => void }) {
  const [rows, setRows] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'disabled'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'member' | 'admin' | 'super_admin'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'recent_login' | 'oldest'>('newest');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [batchBusy, setBatchBusy] = useState(false);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_member_accounts');
    setLoading(false);
    if (error) {
      setMsg('账号资料加载失败：请确认已审核并执行 011_admin_member_accounts.sql。');
      return;
    }
    setRows((data ?? []) as Account[]);
  }, [setMsg]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const matched = rows.filter((r) => {
      if (status === 'active' && !r.joined) return false;
      if (status === 'disabled' && r.joined) return false;
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (!q) return true;
      return [r.username, r.display_name, r.real_name, r.email, r.id]
        .some((v) => (v || '').toLocaleLowerCase().includes(q));
    });
    const time = (value: string | null) => {
      const parsed = value ? Date.parse(value) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return matched.sort((a, b) => {
      if (sortBy === 'recent_login') return time(b.last_sign_in_at) - time(a.last_sign_in_at);
      if (sortBy === 'oldest') return time(a.created_at) - time(b.created_at);
      return time(b.created_at) - time(a.created_at);
    });
  }, [rows, query, status, roleFilter, sortBy]);

  useEffect(() => { setPage(0); }, [query, status, roleFilter, sortBy]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice(page * pageSize, (page + 1) * pageSize);

  async function toggleAccount(account: Account) {
    if (!isSuper) {
      setMsg('账号禁用/恢复仅限超级管理员操作。');
      return;
    }
    if (account.id === me) {
      setMsg('不能禁用自己的账号。');
      return;
    }
    const next = !account.joined;
    const verb = next ? '恢复班级权限' : '暂停班级权限';
    if (!(await confirmDialog(`${verb}账号「${account.display_name || account.username}」？${next ? '' : '暂停后将失去班级成员权限，但不会阻止其登录认证。'}`))) return;
    setBusy(account.id);
    const { error } = await supabase.rpc('set_joined', { target: account.id, j: next });
    setBusy(null);
    if (error) {
      setMsg(`${verb}失败：${error.message}`);
      return;
    }
    setMsg(`已${verb}账号。`);
    await load();
  }

  async function batchSetJoined(joined: boolean) {
    if (!isSuper) return setMsg('批量账号操作仅限超级管理员。');
    const targets = filtered.filter(account => selected.has(account.id) && account.role === 'member' && account.id !== me && account.joined !== joined);
    if (!targets.length) return setMsg('没有可执行的选中账号。');
    const verb = joined ? '恢复班级权限' : '暂停班级权限';
    if (!(await confirmDialog('确认' + verb + '选中的 ' + targets.length + ' 个账号？不会处理当前登录账号。', { danger: !joined }))) return;
    setBatchBusy(true);
    let success = 0; let failed = 0;
    for (const account of targets) {
      const { error } = await supabase.rpc('set_joined', { target: account.id, j: joined });
      if (error) failed++;
      else { success++; /* set_joined writes its own audit row in the database. */ }
    }
    setBatchBusy(false); setSelected(new Set()); await load();
    setMsg('批量' + verb + '完成：成功 ' + success + ' 个，失败 ' + failed + ' 个。');
  }

  function exportAccounts(accounts: Account[], scope: 'filtered' | 'selected') {
    if (!accounts.length) {
      setMsg(scope === 'selected' ? '当前筛选中没有已选成员。' : '当前筛选没有可导出的账号。');
      return;
    }
    const exportRows = [
      ['显示名称', '用户名', '角色', '账号状态', '注册时间', '最近登录'],
      ...accounts.map(account => [
        account.display_name || account.username,
        account.username,
        account.role,
        account.joined ? '权限正常' : '班级权限已暂停',
        account.created_at,
        account.last_sign_in_at || '',
      ]),
    ];
    const csv = '\uFEFF' + exportRows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'qznb-members-' + scope + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(url);
    setMsg('已导出 ' + accounts.length + ' 条基础账号记录，不包含邮箱、联系方式或账号 ID。');
    void alog('member_export', { count: accounts.length, scope: scope + '_basic_fields' });
  }

  function exportFiltered() {
    exportAccounts(filtered, 'filtered');
  }

  function exportSelected() {
    exportAccounts(filtered.filter(account => selected.has(account.id)), 'selected');
  }

  async function copyAccountId(account: Account) {
    try {
      await navigator.clipboard.writeText(account.id);
      setMsg('已复制 ' + (account.display_name || account.username) + ' 的账号 ID。');
    } catch {
      setMsg('复制失败，请展开详细信息后手动复制账号 ID。');
    }
  }

  async function deleteAccount(account: Account) {
    if (!isSuper) {
      setMsg('删除账号仅限超级管理员操作。');
      return;
    }
    if (account.id === me) {
      setMsg('不能删除自己的账号。');
      return;
    }
    if (account.role !== 'member') {
      setMsg('为防止误删管理员，只允许删除普通成员账号。');
      return;
    }
    const label = account.display_name || account.username;
    const confirmed = await confirmDialog(
      `确定永久删除成员「${label}」？此操作不可撤销。该成员的个人资料和登录账号将被删除；其发布的帖子、评论、私信等关联内容也可能因数据库级联规则一并删除。其他成员的账号不会被删除。`,
      { danger: true }
    );
    if (!confirmed) return;
    const reason = await promptDialog('填写永久删除原因（至少 8 个字）', { placeholder: '说明删除原因及必要性' });
    if (!reason || reason.trim().length < 8) {
      setMsg('未提交：请填写至少 8 个字的审批原因。');
      return;
    }
    setBusy(account.id);
    const { data, error } = await supabase.rpc('admin_request_sensitive_action', {
      p_action_type: 'delete_member_account',
      p_target_user_id: account.id,
      p_requested_role: null,
      p_reason: reason.trim(),
    });
    setBusy(null);
    if (error) {
      setMsg(`提交删除审批失败：${error.message}`);
      return;
    }
    setMsg(`已提交「${label}」的永久删除审批（${String(data).slice(0, 8)}）。另一位超级管理员批准后才会真正删除账号。`);
  }

  function toggleDetails(id: string) {
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const activeCount = rows.filter((r) => r.joined).length;
  const disabledCount = rows.length - activeCount;

  return <section>
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <h2 style={{ margin: '0 0 5px', fontSize: 17 }}>账号与成员管理</h2>
          <p style={{ ...muted, margin: 0 }}>查看注册资料、账号状态和可用的最近登录记录。敏感字段仅通过受权限保护的数据库函数读取。</p>
        </div>
        <button style={btn} disabled={loading} onClick={() => void load()}>{loading ? '加载中' : '刷新'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 7, marginTop: 12 }}>
        {[
          ['全部账号', rows.length],
          ['正常成员', activeCount],
          ['已禁用', disabledCount],
        ].map(([label, value]) => <div key={String(label)} style={{ border: '1px solid #ffffff12', borderRadius: 11, padding: 9, background: '#ffffff06' }}>
          <div style={muted}>{label}</div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{value}</div>
        </div>)}
      </div>
    </div>

    <div style={panel}>
      <input value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索用户名、真实姓名、邮箱或账号 ID"
        aria-label="搜索账号"
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: 10, border: '1px solid #ffffff1c', background: '#ffffff08', color: '#fff', fontSize: 13 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
        {([['all', '全部'], ['active', '正常'], ['disabled', '已禁用']] as const).map(([value, label]) =>
          <button key={value} style={{ ...btn, background: status === value ? '#5b8cff44' : '#ffffff08', borderColor: status === value ? '#7da0ff' : '#ffffff20' }}
            aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        {([['all', '全部角色'], ['member', '普通成员'], ['admin', '内容管理员'], ['super_admin', '超级管理员']] as const).map(([value, label]) =>
          <button key={value} style={{ ...btn, padding: '6px 9px', background: roleFilter === value ? '#278b9140' : '#ffffff08', borderColor: roleFilter === value ? '#54c4c9' : '#ffffff20' }}
            aria-pressed={roleFilter === value} onClick={() => setRoleFilter(value)}>{label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <label htmlFor="admin-account-sort" style={{ ...muted, marginRight: 2 }}>排序</label>
        <select id="admin-account-sort" value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}
          style={{ ...btn, color: '#eef0ff', background: '#ffffff08' }}>
          <option value="newest">最新注册</option>
          <option value="recent_login">最近登录</option>
          <option value="oldest">最早注册</option>
        </select>
      </div>
      <p style={{ ...muted, margin: '8px 0 0' }}>当前 {filtered.length} 个账号 · 第 {page + 1}/{pageCount} 页。登录位置只显示用户在资料/设备功能中提供的记录，不会冒充 IP 定位。</p>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
        <button style={btn} onClick={exportFiltered}>导出当前筛选 CSV</button>
        <button style={btn} onClick={() => setSelected(new Set(shown.filter(account => account.role === 'member' && account.id !== me).map(account => account.id)))}>选择本页</button>
        <button style={btn} onClick={() => setSelected(new Set(filtered.filter(account => account.role === 'member' && account.id !== me).map(account => account.id)))}>选择筛选结果</button>
        <button style={btn} onClick={() => setSelected(new Set())}>清空选择</button>
      </div>
      {filtered.some(account => selected.has(account.id)) && <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9, alignItems: 'center' }}>
        <span style={{ ...muted, alignSelf: 'center' }}>当前筛选已选 {filtered.filter(account => selected.has(account.id)).length} 个</span>
        <button style={btn} disabled={batchBusy} onClick={exportSelected}>导出已选 CSV</button>
        <button style={{ ...btn, color: '#8de0b7' }} disabled={batchBusy} onClick={() => void batchSetJoined(true)}>批量恢复</button>
        <button style={{ ...btn, color: '#ffb5c1' }} disabled={batchBusy} onClick={() => void batchSetJoined(false)}>批量暂停权限</button>
      </div>}
    </div>

    {loading && rows.length === 0 && <p style={{ ...muted, textAlign: 'center', padding: 20 }}>正在读取账号信息…</p>}
    {!loading && filtered.length === 0 && <p style={{ ...muted, textAlign: 'center', padding: 20 }}>没有找到符合条件的账号。</p>}

    {shown.map((r) => <article key={r.id} style={{ ...panel, opacity: r.joined ? 1 : .72 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <input type="checkbox" aria-label={'选择 ' + (r.display_name || r.username)} checked={selected.has(r.id)} onChange={event => setSelected(current => { const next = new Set(current); event.target.checked ? next.add(r.id) : next.delete(r.id); return next; })} disabled={r.id === me || r.role !== 'member'} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 750, overflowWrap: 'anywhere' }}>{r.display_name || r.username}
            <span style={{ ...muted, marginLeft: 6 }}>{r.role === 'super_admin' ? '超级管理员' : r.role === 'admin' ? '内容管理员' : '成员'}</span>
          </div>
          <div style={{ ...muted, overflowWrap: 'anywhere' }}>@{r.username} · {r.real_name || '未填写真实姓名'}</div>
          <div style={{ ...muted, overflowWrap: 'anywhere' }}>{r.email || '未取得邮箱记录'}</div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 10.5, padding: '4px 7px', borderRadius: 999, border: '1px solid #ffffff20', color: r.joined ? '#8de0b7' : '#ffb5c1', background: r.joined ? '#4ade8010' : '#ff879610' }}>
          {r.joined ? '正常' : '已禁用'}
        </span>
      </div>

      <div style={{ ...muted, marginTop: 8 }}>
        <div>注册时间：{stamp(r.created_at)}</div>
        <div>最近登录：{stamp(r.last_sign_in_at)}</div>
      </div>

      <button style={{ ...btn, marginTop: 9 }} onClick={() => toggleDetails(r.id)} aria-expanded={expanded.has(r.id)}>
        {expanded.has(r.id) ? '收起详细信息' : '查看详细信息'}
      </button>
      {expanded.has(r.id) && <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid #ffffff12', background: '#ffffff05', overflowWrap: 'anywhere' }}>
        <div style={muted}>账号 ID：{r.id}</div>
        <div style={muted}>邮箱：{r.email || '暂无记录'}</div>
        <div style={muted}>真实姓名：{r.real_name || '未填写'}</div>
        <div style={muted}>资料中的位置：{r.location || '用户未提供'}</div>
        <div style={muted}>设备信息：{r.device || '暂无记录'}</div>
        <div style={muted}>位置/设备资料更新时间：{stamp(r.presence_updated_at)}</div>
        <div style={muted}>账号注册时间：{stamp(r.created_at)}</div>
        <div style={muted}>最近登录时间：{stamp(r.last_sign_in_at)}</div>
      </div>}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
        <button style={btn} onClick={() => setDetailId(r.id)}>成员档案 / 活动记录</button>
        <button style={btn} onClick={() => void copyAccountId(r)}>复制账号 ID</button>
        <button style={{ ...btn, borderColor: r.joined ? '#ff879655' : '#7ed9b055', color: r.joined ? '#ffb5c1' : '#8de0b7' }}
          disabled={!isSuper || r.id === me || busy === r.id}
          onClick={() => void toggleAccount(r)}>
          {busy === r.id ? '处理中…' : r.joined ? '暂停班级权限' : '恢复班级权限'}
        </button>
        {isSuper && r.role === 'member' && <button
          style={{ ...btn, borderColor: '#ff5d6c88', color: '#ff9da7', background: '#ff5d6c12' }}
          disabled={r.id === me || busy === r.id}
          onClick={() => void deleteAccount(r)}>
          {busy === r.id ? '处理中…' : '提交永久删除审批'}
        </button>}
        {!isSuper && <span style={muted}>账号管理操作仅超级管理员可用</span>}
      </div>
    </article>)}
    {detailId && <AdminMemberModal memberId={detailId} onClose={() => setDetailId(null)} onChanged={load} isSuper={isSuper} />}
    {pageCount > 1 && <div style={{ ...panel, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
      <button style={btn} disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>上一页</button>
      <span style={muted}>{page + 1} / {pageCount}</span>
      <button style={btn} disabled={page >= pageCount - 1} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}>下一页</button>
    </div>}
    <div style={{ ...panel, ...muted }}>
      <strong style={{ color: '#dce5ff' }}>管理边界说明</strong>
      <div>本版的“暂停班级权限”沿用现有 set_joined 权限函数，只限制班级成员权限，不会阻止 Supabase 登录，也不等同于远程撤销会话。</div>
      <div>禁言需要单独的发言限制和数据库策略；本版不会把禁用账号伪装成禁言，也不会假装已经采集到真实 IP 定位。</div>
    </div>
  </section>;
}
