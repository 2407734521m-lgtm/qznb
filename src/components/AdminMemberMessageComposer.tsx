import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { confirmDialog } from '../lib/dialog';

type Recipient = { id: string; name: string };

type Props = {
  recipients: Recipient[];
  onClose: () => void;
  setMsg: (message: string) => void;
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 240,
  background: '#020711d9',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  paddingTop: 'max(16px, env(safe-area-inset-top))',
};

const panel: React.CSSProperties = {
  width: '100%',
  maxWidth: 600,
  maxHeight: '90vh',
  overflowY: 'auto',
  borderRadius: '18px 18px 0 0',
  padding: 16,
  margin: 0,
  background: 'linear-gradient(145deg,#17243a,#0b1423)',
  border: '1px solid #ffffff20',
  color: '#edf3f8',
  boxShadow: '0 24px 70px #0009',
};

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #ffffff20',
  borderRadius: 10,
  padding: 11,
  background: '#081321',
  color: '#f1f5f9',
  font: 'inherit',
  fontSize: 13,
};

const muted: React.CSSProperties = {
  color: '#9aabc0',
  fontSize: 12,
  lineHeight: 1.65,
};

const button: React.CSSProperties = {
  border: '1px solid #ffffff22',
  borderRadius: 10,
  padding: '9px 12px',
  background: '#ffffff0c',
  color: '#eaf2f7',
  fontSize: 12,
  cursor: 'pointer',
};

export default function AdminMemberMessageComposer({ recipients, onClose, setMsg }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('/me/notifications');
  const [sending, setSending] = useState(false);

  const uniqueRecipients = useMemo(() => {
    const seen = new Set<string>();
    return recipients.filter(recipient => {
      if (!recipient.id || seen.has(recipient.id)) return false;
      seen.add(recipient.id);
      return true;
    });
  }, [recipients]);

  const canSend = uniqueRecipients.length > 0
    && uniqueRecipients.length <= 100
    && title.trim().length > 0
    && title.trim().length <= 120
    && body.trim().length > 0
    && body.trim().length <= 2000
    && link.trim().length <= 300
    && link.trim().startsWith('/')
    && !link.trim().startsWith('//');

  async function send() {
    if (!canSend) {
      setMsg('请检查标题、正文、站内跳转路径和收件人数。每次最多发送给 100 位成员。');
      return;
    }

    const confirmed = await confirmDialog(
      '确认向 ' + uniqueRecipients.length + ' 位成员发送站内消息？发送后无法撤回。',
      { confirmText: '确认发送' },
    );
    if (!confirmed) return;

    setSending(true);
    const { data, error } = await supabase.rpc('admin_send_member_message', {
      p_title: title.trim(),
      p_body: body.trim(),
      p_recipient_ids: uniqueRecipients.map(recipient => recipient.id),
      p_link: link.trim() || '/me/notifications',
    });
    setSending(false);

    if (error) {
      setMsg('站内消息发送失败：' + error.message);
      return;
    }

    setMsg('站内消息已发送，成功写入 ' + String(data ?? 0) + ' 位成员的通知中心。');
    onClose();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="发送站内消息"
        className="card admin-modal-card"
        onClick={event => event.stopPropagation()}
        style={panel}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 17, margin: '0 0 4px' }}>发送站内消息</h3>
            <p style={{ ...muted, margin: 0 }}>消息会进入成员的通知中心，并显示为「管理员消息」。</p>
          </div>
          <button type="button" style={button} onClick={onClose}>关闭</button>
        </div>

        <div style={{ marginTop: 14, border: '1px solid #ffffff16', borderRadius: 12, padding: 11, background: '#ffffff07' }}>
          <div style={{ fontSize: 13, fontWeight: 750 }}>收件成员 · {uniqueRecipients.length}/100</div>
          {uniqueRecipients.length > 0 && uniqueRecipients.length <= 8
            ? <div style={{ ...muted, marginTop: 5 }}>{uniqueRecipients.map(r => r.name).join('、')}</div>
            : <details style={{ marginTop: 5 }}>
              <summary style={{ ...muted, cursor: 'pointer' }}>查看收件名单（{uniqueRecipients.length} 人）</summary>
              <div style={{ ...muted, marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                {uniqueRecipients.map(r => <div key={r.id}>{r.name}</div>)}
              </div>
            </details>}
          {uniqueRecipients.length > 100 && <p style={{ color: '#ff9fa8', fontSize: 12 }}>一次最多选择 100 位成员，请减少选中人数。</p>}
          {uniqueRecipients.length === 0 && <p style={muted}>没有有效收件人，请返回成员列表重新选择。</p>}
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 13 }}>
          <label style={muted} htmlFor="admin-member-message-title">消息标题 · 最多 120 字</label>
          <input id="admin-member-message-title" value={title} maxLength={120}
            onChange={event => setTitle(event.target.value)} placeholder="例如：关于近期网站安排的通知"
            style={field} />
          <div style={{ ...muted, textAlign: 'right', marginTop: -5 }}>{title.length}/120</div>

          <label style={muted} htmlFor="admin-member-message-body">消息正文 · 最多 2000 字</label>
          <textarea id="admin-member-message-body" value={body} maxLength={2000} rows={5}
            onChange={event => setBody(event.target.value)}
            placeholder="输入要告诉成员的内容……"
            style={{ ...field, resize: 'vertical', lineHeight: 1.65 }} />
          <div style={{ ...muted, textAlign: 'right', marginTop: -5 }}>{body.length}/2000</div>

          <label style={muted} htmlFor="admin-member-message-link">点击通知后的站内跳转</label>
          <input id="admin-member-message-link" value={link} maxLength={300}
            onChange={event => setLink(event.target.value)}
            placeholder="/me/notifications"
            style={field} />
          <p style={{ ...muted, margin: '-3px 0 0' }}>只接受站内路径，不会把成员跳转到外部网站。</p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" style={button} disabled={sending} onClick={onClose}>取消</button>
            <button type="button" disabled={!canSend || sending}
              onClick={() => void send()}
              style={{ ...button, border: 0, color: '#fff', background: 'linear-gradient(135deg,#188b94,#39b9bd)', opacity: !canSend || sending ? .5 : 1 }}>
              {sending ? '发送中…' : '确认发送'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
