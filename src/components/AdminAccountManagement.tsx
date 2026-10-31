import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { confirmDialog } from '../lib/dialog';

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
    return rows.filter((r) => {
      if (status === 'active' && !r.joined) return false;
      if (status === 'disabled' && r.joined) return false;
      if (!q) return true;
      return [r.username, r.display_name, r.real_name, r.email, r.id]
        .some((v) => (v || '').toLocaleLowerCase().includes(q));
    });
  }, [rows, query, status]);

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
    const verb = next ? '恢复' : '禁用';
    if (!(await confirmDialog(`${verb}账号「${account.display_name || account.username}」？${next ? '' : '禁用后将失去班级成员权限。'}`))) return;
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
    setBusy(account.id);
    const { error } = await supabase.rpc('admin_delete_member_account', { target: account.id });
    setBusy(null);
    if (error) {
      setMsg(`删除失败：${error.message}`);
      return;
    }
    setRows((old) => old.filter((r) => r.id !== account.id));
    setExpanded((old) => {
      const next = new Set(old);
      next.delete(account.id);
      return next;
    });
    setMsg(`已永久删除成员「${label}」。`);
    await load();
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
      <p style={{ ...muted, margin: '8px 0 0' }}>当前 {filtered.length} 个账号。登录位置只显示用户在资料/设备功能中提供的记录，不会冒充 IP 定位。</p>
    </div>

    {loading && rows.length === 0 && <p style={{ ...muted, textAlign: 'center', padding: 20 }}>正在读取账号信息…</p>}
    {!loading && filtered.length === 0 && <p style={{ ...muted, textAlign: 'center', padding: 20 }}>没有找到符合条件的账号。</p>}

    {filtered.map((r) => <article key={r.id} style={{ ...panel, opacity: r.joined ? 1 : .72 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
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
        <button style={{ ...btn, borderColor: r.joined ? '#ff879655' : '#7ed9b055', color: r.joined ? '#ffb5c1' : '#8de0b7' }}
          disabled={!isSuper || r.id === me || busy === r.id}
          onClick={() => void toggleAccount(r)}>
          {busy === r.id ? '处理中…' : r.joined ? '禁用账号' : '恢复账号'}
        </button>
        {isSuper && r.role === 'member' && <button
          style={{ ...btn, borderColor: '#ff5d6c88', color: '#ff9da7', background: '#ff5d6c12' }}
          disabled={r.id === me || busy === r.id}
          onClick={() => void deleteAccount(r)}>
          {busy === r.id ? '处理中…' : '永久删除'}
        </button>}
        {!isSuper && <span style={muted}>账号管理操作仅超级管理员可用</span>}
      </div>
    </article>)}
    <div style={{ ...panel, ...muted }}>
      <strong style={{ color: '#dce5ff' }}>管理边界说明</strong>
      <div>本版的“禁用账号”沿用现有 set_joined 权限函数。它限制班级成员权限，不等同于撤销 Supabase 登录会话。</div>
      <div>禁言需要单独的发言限制和数据库策略；本版不会把禁用账号伪装成禁言，也不会假装已经采集到真实 IP 定位。</div>
    </div>
  </section>;
}
