import { useState } from 'react';
import { confirmDialog } from '../lib/dialog';
import { alog } from '../pages/admin/shared';
import { supabase } from '../lib/supabase';

type Recipient = { id: string; name: string };

type Props = {
  recipient: Recipient;
  createdBy: string;
  onClose: () => void;
  setMsg: (message: string) => void;
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 260,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
  background: 'rgba(15, 23, 42, .48)',
};

const panel: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  maxHeight: 'min(760px, calc(100dvh - 32px))',
  overflowY: 'auto',
  border: '1px solid var(--admin-border, #e2e8f0)',
  borderRadius: 18,
  padding: 18,
  background: 'var(--admin-surface, #fff)',
  color: 'var(--admin-text, #172033)',
  boxShadow: '0 24px 70px rgba(15, 23, 42, .2)',
};

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid var(--admin-border, #dbe2ea)',
  borderRadius: 11,
  padding: '11px 12px',
  background: 'var(--admin-surface-muted, #f8fafc)',
  color: 'var(--admin-text, #172033)',
  font: 'inherit',
  fontSize: 13,
};

const muted: React.CSSProperties = {
  color: 'var(--admin-muted, #64748b)',
  fontSize: 12,
  lineHeight: 1.65,
};

const button: React.CSSProperties = {
  border: '1px solid var(--admin-border, #dbe2ea)',
  borderRadius: 10,
  padding: '9px 12px',
  background: 'var(--admin-surface-muted, #f8fafc)',
  color: 'var(--admin-text, #172033)',
  fontSize: 12,
  cursor: 'pointer',
};

const expiryOptions = [
  { value: '1', label: '1 天' },
  { value: '3', label: '3 天' },
  { value: '7', label: '7 天' },
  { value: '0', label: '不过期' },
] as const;

export default function AdminMemberPopupComposer({ recipient, createdBy, onClose, setMsg }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [buttonLabel, setButtonLabel] = useState('知道了');
  const [expiryDays, setExpiryDays] = useState<'1' | '3' | '7' | '0'>('7');
  const [busy, setBusy] = useState(false);

  async function publish() {
    const normalizedTitle = title.trim();
    const normalizedBody = body.trim();
    if (!normalizedTitle && !normalizedBody) {
      setMsg('弹窗标题和正文至少填写一项。');
      return;
    }
    if (!createdBy) {
      setMsg('管理员会话已失效，请重新登录。');
      return;
    }

    const { data: eligibleMember, error: memberError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', recipient.id)
      .eq('joined', true)
      .maybeSingle();
    if (memberError || !eligibleMember) {
      setMsg(memberError ? '无法确认该成员状态：' + memberError.message : '该成员当前未加入，不能向其发送弹窗。');
      return;
    }

    const confirmed = await confirmDialog(
      '确认只向「' + recipient.name + '」发布这条弹窗？对方在线时会在下一轮页面同步时看到；离线时会在 7 天有效期内下次打开网站或软件版时看到。这不是手机系统推送。',
      { confirmText: '发布给此成员' },
    );
    if (!confirmed) return;

    setBusy(true);
    const days = Number(expiryDays);
    const { error } = await supabase.from('admin_broadcasts').insert({
      kind: 'popup',
      title: normalizedTitle,
      body: normalizedBody,
      button_label: buttonLabel.trim() || '知道了',
      audience: 'selected',
      created_by: createdBy,
      options: [],
      target_ids: [recipient.id],
      starts_at: null,
      expires_at: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null,
    });
    setBusy(false);

    if (error) {
      setMsg('单独弹窗发布失败：' + error.message);
      return;
    }

    await alog('broadcast_post', {
      kind: 'popup',
      audience: 'selected',
      targets: 1,
      entrypoint: 'member_account',
    });
    setMsg('已向「' + recipient.name + '」发布单独弹窗。');
    onClose();
  }

  return (
    <div
      style={overlay}
      role="presentation"
      onClick={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-member-popup-title"
        className="admin-modal-card"
        onClick={event => event.stopPropagation()}
        style={panel}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 id="admin-member-popup-title" style={{ margin: 0, fontSize: 17 }}>向成员单独弹窗</h3>
            <p style={{ ...muted, margin: '5px 0 0' }}>仅发送给：<strong>{recipient.name}</strong></p>
          </div>
          <button type="button" style={button} disabled={busy} onClick={onClose}>关闭</button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
          <label htmlFor="admin-member-popup-title" style={muted}>弹窗标题 · 最多 60 字</label>
          <input
            id="admin-member-popup-title"
            value={title}
            maxLength={60}
            onChange={event => setTitle(event.target.value)}
            placeholder="输入弹窗标题"
            style={field}
          />
          <label htmlFor="admin-member-popup-body" style={muted}>弹窗正文 · 最多 500 字</label>
          <textarea
            id="admin-member-popup-body"
            value={body}
            maxLength={500}
            rows={5}
            onChange={event => setBody(event.target.value)}
            placeholder="输入只想让这位成员看到的内容"
            style={{ ...field, resize: 'vertical', lineHeight: 1.65 }}
          />
          <label htmlFor="admin-member-popup-button" style={muted}>确认按钮文字 · 最多 12 字</label>
          <input
            id="admin-member-popup-button"
            value={buttonLabel}
            maxLength={12}
            onChange={event => setButtonLabel(event.target.value)}
            placeholder="知道了"
            style={field}
          />
          <div>
            <div style={muted}>弹窗有效期</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 7 }}>
              {expiryOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={expiryDays === option.value}
                  onClick={() => setExpiryDays(option.value)}
                  style={{
                    ...button,
                    borderColor: expiryDays === option.value ? 'var(--admin-accent, #6479d8)' : 'var(--admin-border, #dbe2ea)',
                    background: expiryDays === option.value ? 'var(--admin-accent-soft, #eef1ff)' : 'var(--admin-surface-muted, #f8fafc)',
                    fontWeight: expiryDays === option.value ? 700 : 500,
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <p style={{ ...muted, margin: 0 }}>成员端只会按这位成员的账号 ID 显示弹窗，其他成员不会收到。有效期默认 7 天。</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 5 }}>
            <button type="button" style={button} disabled={busy} onClick={onClose}>取消</button>
            <button
              type="button"
              disabled={busy || (!title.trim() && !body.trim())}
              onClick={() => void publish()}
              style={{
                ...button,
                border: 0,
                color: '#fff',
                background: 'var(--admin-accent, #536bd5)',
                opacity: busy || (!title.trim() && !body.trim()) ? .55 : 1,
                fontWeight: 700,
              }}
            >
              {busy ? '发布中…' : '发布单独弹窗'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
