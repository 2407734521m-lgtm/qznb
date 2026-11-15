import type { ReactNode } from 'react';
import type { ActivityHandle, IslandApi } from '../lib/island';
import './QianzhiIslandAlert.css';

export type IslandAlertKind = 'message' | 'friend' | 'interaction' | 'system';

export interface IslandAlertInput {
  id: string;
  kind: IslandAlertKind;
  title: string;
  body?: string;
  priority: number;
  onPress?: () => void;
  durationMs?: number;
}

const LABELS: Record<IslandAlertKind, string> = {
  message: '私信',
  friend: '好友',
  interaction: '互动',
  system: '通知',
};

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
  const end = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    handle?.end();
  };

  handle = api.start({
    id,
    label: input.title,
    priority: input.priority,
    alert: true,
    compact: {
      leading: <CompactAlert kind={input.kind} />,
    },
    minimal: <CompactAlert kind={input.kind} />,
    expanded: {
      leading: <span className="qz-island-alert-expanded-label">{LABELS[input.kind]}</span>,
      center: <ExpandedAlert kind={input.kind} title={input.title} body={input.body} />,
    },
    onPress: () => {
      end();
      input.onPress?.();
    },
  });

  timer = window.setTimeout(end, Math.max(3500, Math.min(12000, input.durationMs ?? 6500)));
  return handle;
}
