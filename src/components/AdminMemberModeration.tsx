import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { confirmDialog, promptDialog } from '../lib/dialog';

type ActionType = 'warning' | 'community_mute' | 'chat_mute' | 'interaction_suspend';

type ModerationAction = {
  id: string;
  action_type: ActionType;
  reason: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  active: boolean;
  actor_name: string;
  revoked_by_name: string | null;
};

type ModerationResponse = {
  target_user_id: string;
  actions: ModerationAction[];
};

type Props = {
  memberId: string;
  memberName: string;
  onClose: () => void;
  setMsg: (message: string) => void;
};

const actionLabels: Record<ActionType, string> = {
  warning: '成员警告',
  community_mute: '社区禁言',
  chat_mute: '私聊禁言',
  interaction_suspend: '全站互动限制',
};

const panel: React.CSSProperties = {
  width: '100%',
  maxWidth: 600,
  maxHeight: '88vh',
  overflowY: 'auto',
  borderRadius: '18px 18px 0 0',
  margin: 0,
  padding: 16,
  color: '#edf3f8',
  background: 'linear-gradient(145deg,#17243a,#0b1423)',
  border: '1px solid #ffffff20',
  boxShadow: '0 24px 70px #0009',
};

const muted: React.CSSProperties = {
  color: '#9aabc0',
  fontSize: 12,
  lineHeight: 1.65,
};

const button: React.CSSProperties = {
  border: '1px solid #ffffff22',
  borderRadius: 10,
  padding: '8px 11px',
  background: '#ffffff0c',
  color: '#eaf2f7',
  fontSize: 12,
  cursor: 'pointer',
};

function stamp(value: string | null) {
  if (!value) return '长期，直到手动解除';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString();
}

function isActive(action: ModerationAction, now: number) {
  return action.action_type !== 'warning'
    && !action.revoked_at
    && (!action.expires_at || Date.parse(action.expires_at) > now);
}

export default function AdminMemberModeration({
  memberId, memberName, onClose, setMsg,
}: Props) {
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [actionType, setActionType] = useState<ActionType>('community_mute');
  const [duration, setDuration] = useState('24');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase.rpc('admin_member_moderation', {
      p_target_user_id: memberId,
    });
    setLoading(false);
    if (error) {
      setLoadError(error.message);
      return;
    }
    const payload = data as unknown as ModerationResponse;
    setActions(Array.isArray(payload?.actions) ? payload.actions : []);
  }, [memberId]);

  useEffect(() => { void load(); }, [load]);

  const activeActions = useMemo(
    () => actions.filter(action => isActive(action, Date.now())),
    [actions],
  );

  async function applyAction() {
    if (reason.trim().length < 8) {
      setMsg('请填写至少 8 个字的处理原因。');
      return;
    }
    setBusy('apply');
    const durationHours = actionType === 'warning' || duration === 'unlimited'
      ? null
      : Number(duration);
    const { error } = await supabase.rpc('admin_apply_member_moderation', {
      p_target_user_id: memberId,
      p_action_type: actionType,
      p_reason: reason.trim(),
      p_duration_hours: durationHours,
    });
    setBusy(null);
    if (error) {
      setMsg('成员处理失败：' + error.message);
      return;
    }
    setReason('');
    setMsg('已记录' + actionLabels[actionType] + '。');
    await load();
  }

  async function revokeAction(action: ModerationAction) {
    const confirmed = await confirmDialog(
      '确定解除该成员的「' + actionLabels[action.action_type] + '」吗？',
    );
    if (!confirmed) return;
    const revokeReason = await promptDialog('填写解除原因（至少 8 个字）', {
      placeholder: '说明为什么提前解除该限制',
    });
    if (!revokeReason || revokeReason.trim().length < 8) {
      setMsg('未解除：请填写至少 8 个字的解除原因。');
      return;
    }
    setBusy(action.id);
    const { error } = await supabase.rpc('admin_revoke_member_moderation', {
      p_action_id: action.id,
      p_reason: revokeReason.trim(),
    });
    setBusy(null);
    if (error) {
      setMsg('解除限制失败：' + error.message);
      return;
    }
    setMsg('已解除成员限制。');
    await load();
  }

  return (
    <div
      className="admin-modal-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 230, background: '#020711c9',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
      }}
      onClick={onClose}
    >
      <section
        className="card admin-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="成员纪律管理"
        onClick={event => event.stopPropagation()}
        style={panel}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>成员纪律管理</div>
            <div style={muted}>{memberName} · 仅超级管理员可操作</div>
          </div>
          <button type="button" style={button} onClick={onClose}>关闭</button>
        </div>

        <div style={{ marginTop: 14, border: '1px solid #ffffff18', borderRadius: 13, padding: 12, background: '#ffffff07' }}>
          <div style={{ fontWeight: 750, fontSize: 13, marginBottom: 8 }}>新增处理</div>
          <label style={{ ...muted, display: 'block', marginBottom: 5 }}>处理类型</label>
          <select
            value={actionType}
            onChange={event => setActionType(event.target.value as ActionType)}
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 9, color: '#edf3f8', background: '#101c2d', border: '1px solid #ffffff22' }}
          >
            <option value="community_mute">社区禁言 · 禁止动态、评论、留言等</option>
            <option value="chat_mute">私聊禁言 · 禁止发送私信及消息互动</option>
            <option value="interaction_suspend">全站互动限制 · 社区、私聊和好友申请</option>
            <option value="warning">成员警告 · 只记录，不限制功能</option>
          </select>

          <label style={{ ...muted, display: 'block', margin: '10px 0 5px' }}>限制时长</label>
          <select
            value={actionType === 'warning' ? 'record' : duration}
            disabled={actionType === 'warning'}
            onChange={event => setDuration(event.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 9, color: '#edf3f8', background: '#101c2d', border: '1px solid #ffffff22', opacity: actionType === 'warning' ? .55 : 1 }}
          >
            {actionType === 'warning' && <option value="record">警告记录，不设时长</option>}
            <option value="1">1 小时</option>
            <option value="24">24 小时</option>
            <option value="72">3 天</option>
            <option value="168">7 天</option>
            <option value="unlimited">长期，直到手动解除</option>
          </select>

          <label style={{ ...muted, display: 'block', margin: '10px 0 5px' }}>处理原因（至少 8 个字）</label>
          <textarea
            rows={3}
            value={reason}
            onChange={event => setReason(event.target.value)}
            maxLength={500}
            placeholder="记录具体情况和处理依据，便于后续复核"
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 10, borderRadius: 9, color: '#edf3f8', background: '#101c2d', border: '1px solid #ffffff22' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
            <span style={muted}>{reason.trim().length}/500</span>
            <button
              type="button"
              disabled={busy === 'apply' || reason.trim().length < 8}
              onClick={() => void applyAction()}
              style={{ ...button, border: 0, background: 'linear-gradient(135deg,#157c86,#269ea0)', color: '#fff', opacity: busy === 'apply' || reason.trim().length < 8 ? .55 : 1 }}
            >
              {busy === 'apply' ? '提交中…' : actionType === 'warning' ? '记录警告' : '确认执行'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 750 }}>当前生效限制（{activeActions.length}）</div>
            <button type="button" style={button} onClick={() => void load()} disabled={loading}>
              {loading ? '刷新中…' : '刷新记录'}
            </button>
          </div>
          {loading ? <p style={muted}>正在读取纪律记录…</p>
            : loadError ? <p style={{ ...muted, color: '#ff9fa8' }}>读取失败：{loadError}</p>
              : activeActions.length === 0 ? <p style={muted}>当前没有生效中的限制。</p>
                : <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {activeActions.map(action => (
                    <div key={action.id} style={{ border: '1px solid #e6a85c44', borderRadius: 11, padding: 10, background: '#e6a85c0c' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ fontSize: 12.5 }}>{actionLabels[action.action_type]}</strong>
                        <button
                          type="button"
                          style={{ ...button, color: '#8de0b7', borderColor: '#8de0b766' }}
                          disabled={busy === action.id}
                          onClick={() => void revokeAction(action)}
                        >
                          {busy === action.id ? '处理中…' : '解除限制'}
                        </button>
                      </div>
                      <div style={{ ...muted, marginTop: 5 }}>截止时间：{stamp(action.expires_at)}</div>
                      <div style={muted}>执行人：{action.actor_name || '管理员'} · {stamp(action.created_at)}</div>
                      <div style={{ fontSize: 12, marginTop: 5, overflowWrap: 'anywhere' }}>原因：{action.reason}</div>
                    </div>
                  ))}
                </div>}
        </div>

        <div style={{ marginTop: 14, borderTop: '1px solid #ffffff18', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 7 }}>处理历史（{actions.length}）</div>
          {actions.length === 0 && !loading ? <p style={muted}>暂无处理记录。</p>
            : <div style={{ display: 'grid', gap: 8 }}>
              {actions.map(action => {
                const active = isActive(action, Date.now());
                const status = action.action_type === 'warning'
                  ? '警告记录'
                  : action.revoked_at ? '已解除'
                    : active ? '生效中' : '已到期';
                return (
                  <div key={action.id} style={{ borderTop: '1px solid #ffffff10', paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 12 }}>{actionLabels[action.action_type]}</strong>
                      <span style={{ ...muted, color: active ? '#f1c37d' : '#9aabc0' }}>{status}</span>
                    </div>
                    <div style={{ ...muted, marginTop: 3 }}>{stamp(action.created_at)} · {action.actor_name || '管理员'}</div>
                    <div style={{ fontSize: 12, marginTop: 3, overflowWrap: 'anywhere' }}>{action.reason}</div>
                    {action.revoked_at && <div style={muted}>解除时间：{stamp(action.revoked_at)} · {action.revoked_by_name || '管理员'} · {action.revocation_reason || '未填写解除说明'}</div>}
                    {!action.revoked_at && action.action_type !== 'warning' && <div style={muted}>限制截止：{stamp(action.expires_at)}</div>}
                  </div>
                );
              })}
            </div>}
        </div>
        <p style={{ ...muted, margin: '12px 0 0' }}>
          禁言由数据库权限执行，不只是隐藏前端按钮。被限制成员仍可登录、浏览内容、查看自己的资料及提交举报；解除后按原权限恢复。
        </p>
      </section>
    </div>
  );
}
