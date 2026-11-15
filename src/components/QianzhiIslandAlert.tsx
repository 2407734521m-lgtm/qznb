import { useState, type FormEvent, type ReactNode } from 'react';
import type { ActivityHandle, IslandApi } from '../lib/island';
import './QianzhiIslandAlert.css';

export type IslandAlertKind = 'message' | 'friend' | 'interaction' | 'system';

export interface IslandAlertInput {
  id: string;
  kind: IslandAlertKind;
  title: string;
  body?: string;
  priority: number;
  /** False keeps low-priority activity in compact mode instead of forcing an expansion. */
  alert?: boolean;
  onPress?: () => void;
  /** Optional private text reply for a verified in-site conversation. */
  onQuickReply?: (body: string) => Promise<void>;
  onQuickReplyEngage?: () => void;
  durationMs?: number;
}

const LABELS: Record<IslandAlertKind, string> = {
  message: '私信',
  friend: '好友',
  interaction: '互动',
  system: '通知',
};

/**
 * Collapse a burst of realtime notifications into one private, actionable heads-up.
 * Select the highest-priority destination, but never copy the original message/comment text
 * into the combined preview.
 */
export function combineIslandAlertBatch(items: readonly IslandAlertInput[]): IslandAlertInput | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const selected = items.reduce((best, item) => item.priority >= best.priority ? item : best);
  const labels: Record<IslandAlertKind, string> = {
    message: '私信',
    friend: '好友申请',
    interaction: '互动',
    system: '系统通知',
  };
  const categories = [...new Set(items.map(item => item.kind))];
  const body = '包含 ' + categories.map(kind => labels[kind]).join('、') + '，点击查看详情';

  return {
    id: 'batch-' + items[0].id + '-' + items[items.length - 1].id + '-' + items.length,
    kind: selected.kind,
    title: '收到 ' + items.length + ' 条新提醒',
    body,
    priority: selected.priority,
    alert: selected.alert !== false,
    onPress: selected.onPress,
    durationMs: 7500,
  };
}

const ICONS: Record<IslandAlertKind, ReactNode> = {
  message: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v11h-9l-4.5 3v-14Z" /><path d="M8 10h8M8 13h5" /></svg>,
  friend: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.4-3 2.2-4.7 5.5-4.7 1.3 0 2.4.3 3.2.8M17.5 9v7M14 12.5h7" /></svg>,
  interaction: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 20-7.2-7.1a4.2 4.2 0 0 1 5.9-6L12 8.2l1.3-1.3a4.2 4.2 0 0 1 5.9 6L12 20Z" /></svg>,
  system: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 20 18H4L12 3.5Z" /><path d="M12 9v4M12 16h.01" /></svg>,
};

function CompactAlert({ kind }: { kind: IslandAlertKind }) {
  return (
    <span className="qz-island-alert-compact">
      <span className="qz-island-alert-icon">{ICONS[kind]}</span>
      <span>{LABELS[kind]}</span>
    </span>
  );
}

function QuickReplyForm({ onSend, onEngage }: { onSend: (body: string) => Promise<void>; onEngage: () => void }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const body = value.trim().slice(0, 2000);
    if (!body || sending || sent) return;
    setSending(true);
    setStatus('');
    try {
      await onSend(body);
      setValue('');
      setSent(true);
      setStatus('已发送');
    } catch {
      setStatus('发送失败，请打开私聊重试');
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="qz-island-quick-reply"
      onSubmit={submit}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      aria-label="快速回复私信"
    >
      <input
        value={value}
        maxLength={2000}
        onChange={event => setValue(event.target.value)}
        placeholder="快速回复…"
        aria-label="快速回复内容"
        disabled={sending || sent}
        onFocus={onEngage}
      />
      <button type="submit" disabled={!value.trim() || sending || sent}>
        {sending ? '发送中' : sent ? '已发送' : '发送'}
      </button>
      {status && <small role="status">{status}</small>}
    </form>
  );
}

function ExpandedAlert({ kind, title, body }: Pick<IslandAlertInput, 'kind' | 'title' | 'body'>) {
  return (
    <span className="qz-island-alert-expanded">
      <span className="qz-island-alert-expanded-icon">{ICONS[kind]}</span>
      <span className="qz-island-alert-copy">
        <strong>{title}</strong>
        {body ? <small>{body}</small> : null}
      </span>
    </span>
  );
}

/** Adds a short-lived, tappable activity without replacing music or other ongoing activities. */
export function showIslandAlert(api: IslandApi, input: IslandAlertInput): ActivityHandle {
  const id = 'qz-alert-' + input.kind + '-' + input.id;
  let handle: ActivityHandle | null = null;
  let timer: number | null = null;
  const duration = Math.max(3500, Math.min(12000, input.durationMs ?? 6500));
  const end = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    handle?.end();
  };
  const scheduleEnd = (delayMs: number) => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(end, delayMs);
  };

  handle = api.start({
    id,
    label: input.title,
    priority: input.priority,
    alert: input.alert !== false,
    compact: {
      leading: <CompactAlert kind={input.kind} />,
    },
    minimal: <CompactAlert kind={input.kind} />,
    expanded: {
      leading: <span className="qz-island-alert-expanded-label">{LABELS[input.kind]}</span>,
      center: <ExpandedAlert kind={input.kind} title={input.title} body={input.body} />,
      ...(input.kind === 'message' && input.onQuickReply
        ? { bottom: <QuickReplyForm onSend={input.onQuickReply} onEngage={() => { input.onQuickReplyEngage?.(); scheduleEnd(45_000); }} /> }
        : {}),
    },
    onPress: () => {
      end();
      input.onPress?.();
    },
  });

  scheduleEnd(duration);
  return handle;
}
