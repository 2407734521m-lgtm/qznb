import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { card, h3, mut, timeAgo } from '../pages/admin/shared';
import { confirmDialog, promptDialog } from '../lib/dialog';

type ApprovalRequest = {
  id: string;
  action_type: 'delete_member_account' | 'set_role';
  target_user_id: string;
  target_name: string;
  requester_id: string;
  requester_name: string;
  requested_role: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  decided_by_name: string;
  decision_note: string | null;
};

const actionLabel = (item: ApprovalRequest) => item.action_type === 'delete_member_account'
  ? '永久删除成员账号'
  : '调整成员角色为' + (item.requested_role === 'admin' ? '内容管理员' : '普通成员');

const statusLabel: Record<ApprovalRequest['status'], string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
  expired: '已过期',
};

export default function AdminApprovalCenter({ setMsg, me }: { setMsg: (message: string) => void; me: string }) {
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('admin_sensitive_action_requests');
    if (rpcError) {
      setError(rpcError.message);
      setRows([]);
    } else {
      setRows(Array.isArray(data) ? data as ApprovalRequest[] : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => filter === 'pending' ? rows.filter(item => item.status === 'pending') : rows,
    [rows, filter],
  );

  async function decide(item: ApprovalRequest, approve: boolean) {
    if (item.status !== 'pending') return;
    if (item.requester_id === me) {
      setMsg('这是你发起的申请，需要由另一位超级管理员处理；本人不能批准或拒绝自己的申请。');
      return;
    }
    let note = '';
    if (approve) {
      if (!(await confirmDialog(
        '批准后将立即执行「' + actionLabel(item) + '」。请先核对申请人、对象和原因。此操作可能不可逆。',
        { danger: item.action_type === 'delete_member_account', confirmText: '批准并执行' },
      ))) return;
    } else {
      const value = await promptDialog('填写拒绝原因（至少 3 个字）', { placeholder: '说明拒绝原因' });
      if (!value || value.trim().length < 3) {
        setMsg('未处理：请填写至少 3 个字的拒绝原因。');
        return;
      }
      note = value.trim();
    }

    setBusy(item.id);
    const { error: decisionError } = await supabase.rpc('admin_decide_sensitive_action', {
      p_request_id: item.id,
      p_approve: approve,
      p_note: note,
    });
    setBusy(null);
    if (decisionError) {
      const selfApproval = decisionError.message.toLowerCase().includes('requester cannot approve their own request');
      setMsg(selfApproval
        ? '这是你发起的申请，需要由另一位超级管理员处理；本人不能批准或拒绝自己的申请。'
        : (approve ? '审批执行失败：' : '拒绝申请失败：') + decisionError.message);
      if (selfApproval) await load();
      return;
    }
    setMsg(approve ? '审批通过，操作已由数据库执行。' : '已拒绝该审批申请。');
    await load();
  }

  return <div style={{ display: 'grid', gap: 12 }}>
    <section style={{ ...card, background: 'linear-gradient(135deg,#17213b,#11182a)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>双人审批中心</div>
          <div style={mut}>高风险操作必须由另一位超级管理员批准；申请人不能批准自己的申请。</div>
        </div>
        <button className="mini" disabled={loading} onClick={() => void load()}>{loading ? '刷新中…' : '刷新'}</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className={'mini' + (filter === 'pending' ? '' : ' ghost')} onClick={() => setFilter('pending')}>待审批</button>
        <button className={'mini' + (filter === 'all' ? '' : ' ghost')} onClick={() => setFilter('all')}>最近记录</button>
      </div>
      <div style={{ ...mut, marginTop: 9 }}>申请有效期为 72 小时。批准时会重新检查目标账号状态，防止过期或目标已变化的申请被执行。</div>
      {error && <p style={{ color: '#ffaaaa', fontSize: 12.5, marginBottom: 0 }}>读取失败：{error}</p>}
    </section>

    {loading && rows.length === 0 ? <p style={mut}>正在读取审批记录…</p> : visible.length === 0
      ? <section style={card}><p style={{ ...mut, margin: 0 }}>{filter === 'pending' ? '目前没有待审批申请。' : '暂无审批记录。'}</p></section>
      : visible.map(item => <article key={item.id} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{actionLabel(item)}</div>
            <div style={{ ...mut, marginTop: 4 }}>目标：{item.target_name}</div>
            <div style={mut}>申请人：{item.requester_name}</div>
          </div>
          <span style={{
            flexShrink: 0, padding: '4px 8px', borderRadius: 999, fontSize: 11,
            color: item.status === 'pending' ? '#ffd18a' : item.status === 'approved' ? '#8de0b7' : '#b9c2d8',
            background: item.status === 'pending' ? '#f59e0b18' : item.status === 'approved' ? '#4ade8015' : '#ffffff0b',
            border: '1px solid #ffffff18',
          }}>{statusLabel[item.status]}</span>
        </div>
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#ffffff08', border: '1px solid #ffffff10' }}>
          <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.reason}</div>
        </div>
        <div style={{ ...mut, marginTop: 8 }}>提交：{timeAgo(item.created_at)} · {new Date(item.created_at).toLocaleString()}</div>
        {item.status === 'pending'
          ? <div style={mut}>到期：{new Date(item.expires_at).toLocaleString()}</div>
          : <div style={mut}>处理：{item.decided_by_name || '管理员'} · {item.decided_at ? new Date(item.decided_at).toLocaleString() : '—'}{item.decision_note ? ' · ' + item.decision_note : ''}</div>}
        {item.status === 'pending' && <>
          {item.requester_id === me && <div role="status" style={{
            marginTop: 12, padding: 10, borderRadius: 10, lineHeight: 1.65,
            color: '#f6d69d', background: 'rgba(245,158,11,.09)',
            border: '1px solid rgba(245,158,11,.22)', fontSize: 12,
          }}>这是你发起的申请，需要由另一位超级管理员处理。本人不能批准或拒绝自己的申请。</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="mini" disabled={busy === item.id || item.requester_id === me} onClick={() => void decide(item, true)}>
              {busy === item.id ? '处理中…' : '批准并执行'}
            </button>
            <button className="mini danger" disabled={busy === item.id || item.requester_id === me} onClick={() => void decide(item, false)}>拒绝申请</button>
          </div>
        </>}
      </article>)}
    <section style={card}>
      <h3 style={h3}>当前审批范围</h3>
      <div style={mut}>本阶段强制覆盖永久删除普通成员账号和成员角色调整。禁用/恢复仍按现有可逆权限流程执行；其他高风险模块会在逐项接入审批前保持原有权限边界，不会显示虚假的“已审批保护”。</div>
    </section>
  </div>;
}
