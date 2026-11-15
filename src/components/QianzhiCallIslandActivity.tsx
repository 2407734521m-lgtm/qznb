import type { ActivityOptions } from '../lib/island';
import type { CallPhase } from '../lib/call';
import './QianzhiCallIslandActivity.css';

export interface CallIslandActivityInput {
  phase: CallPhase;
  peerName: string;
  seconds: number;
  muted: boolean;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onRestore: () => void;
}

function formatDuration(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds));
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 3.8 10 7.6 8.4 9.3c1.1 2.2 2.8 3.9 5 5l1.7-1.6 3.8 2.8-.8 3.1c-.2.8-1 1.3-1.8 1.2C9 18.8 5.2 15 4.2 7.7c-.1-.8.4-1.6 1.2-1.8l1.8-.5Z" />
    </svg>
  );
}

function CallAction({ label, tone, onAction }: { label: string; tone?: 'primary' | 'danger'; onAction: () => void }) {
  return (
    <button
      type="button"
      className={'qz-call-island-action' + (tone ? ' is-' + tone : '')}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.preventDefault(); event.stopPropagation(); onAction(); }}
    >
      {label}
    </button>
  );
}

/** Maps the existing WebRTC state machine to one high-priority island activity. */
export function createCallIslandActivity(input: CallIslandActivityInput): ActivityOptions {
  const { phase, peerName, seconds, muted } = input;
  const phaseLabel = phase === 'incoming'
    ? '来电邀请'
    : phase === 'outgoing'
      ? '等待接听'
      : phase === 'connecting'
        ? '正在连接'
        : '通话中';
  const peer = peerName.trim() || '好友';
  const duration = formatDuration(seconds);
  const trailing = phase === 'in-call' ? duration : phase === 'connecting' ? '…' : '';

  return {
    id: 'qz-call-session',
    onPress: input.onRestore,
    label: `${phaseLabel}，${peer}`,
    priority: 120,
    alert: phase === 'incoming',
    compact: {
      leading: (
        <span className={'qz-call-island-compact' + (phase === 'incoming' ? ' is-ringing' : phase === 'in-call' ? ' is-active' : '')}>
          <span className="qz-call-island-icon"><PhoneIcon /></span>
          <span>{phase === 'incoming' ? '来电' : phase === 'outgoing' ? '呼叫中' : phase === 'connecting' ? '连接中' : '通话'}</span>
        </span>
      ),
      trailing: <span className="qz-call-island-time">{trailing || peer.slice(0, 8)}</span>,
    },
    minimal: <span className="qz-call-island-minimal" aria-label={phaseLabel}><PhoneIcon /></span>,
    expanded: {
      leading: <span className="qz-call-island-label">语音通话</span>,
      center: (
        <span className="qz-call-island-copy">
          <strong>{peer}</strong>
          <small>{phaseLabel}{phase === 'in-call' ? ` · ${duration}` : ''}{muted && phase === 'in-call' ? ' · 已静音' : ''}</small>
        </span>
      ),
      bottom: (
        <div className="qz-call-island-actions">
          {phase === 'incoming' ? (
            <>
              <CallAction label="拒绝" tone="danger" onAction={input.onReject} />
              <CallAction label="接听" tone="primary" onAction={input.onAccept} />
            </>
          ) : phase === 'outgoing' ? (
            <CallAction label="取消呼叫" tone="danger" onAction={input.onCancel} />
          ) : phase === 'connecting' ? (
            <>
              <CallAction label="返回通话" onAction={input.onRestore} />
              <CallAction label="取消连接" tone="danger" onAction={input.onHangUp} />
            </>
          ) : (
            <>
              <CallAction label="返回通话" onAction={input.onRestore} />
              <CallAction label={muted ? '取消静音' : '静音'} onAction={input.onToggleMute} />
              <CallAction label="挂断" tone="danger" onAction={input.onHangUp} />
            </>
          )}
        </div>
      ),
    },
  };
}
