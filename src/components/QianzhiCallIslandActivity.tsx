import { useEffect, useState } from 'react';
import type { ActivityOptions } from '../lib/island';
import type { CallPhase } from '../lib/call';
import './QianzhiCallIslandActivity.css';

export interface CallIslandActivityInput {
  phase: CallPhase;
  peerName: string;
  startedAt: number | null;
  muted: boolean;
  speakerEnabled: boolean;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onRestore: () => void;
  /** Collapses the expanded island back to the pill. Never ends the call. */
  onCollapse: () => void;
  /**
   * Expands the island in place when the pill is tapped. Never navigates or
   * restores the fullscreen call UI — the hang-up action lives in the
   * expanded island itself, so it must be one tap away.
   */
  onExpand: () => void;
}

export interface CallIslandTargetRectInput {
  presentation: string | undefined;
  docked: boolean;
  pillRect: { left: number; top: number; width: number; height: number } | null;
  viewportWidth: number;
  anchorTop: number;
  shapeTop: number;
  shapeHeight: number;
  configuredWidth: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Resolve the call-flight landing point even when the island is currently translated
 * off-screen. A docked pill keeps its measured horizontal size, but its vertical
 * destination comes from the saved capsule geometry rather than its hidden DOM rect.
 */
export function resolveCallIslandTargetRect(input: CallIslandTargetRectInput) {
  const pill = input.pillRect;
  if (
    input.presentation !== 'expanded'
    && pill
    && pill.width > 0
    && pill.height > 0
  ) {
    return {
      left: pill.left,
      top: input.docked ? input.anchorTop + input.shapeTop + input.offsetY : pill.top,
      width: pill.width,
      height: pill.height,
    };
  }

  const width = Math.max(1, input.configuredWidth);
  const height = Math.max(1, input.shapeHeight);
  return {
    left: input.viewportWidth / 2 + input.offsetX - width / 2,
    top: input.anchorTop + input.shapeTop + input.offsetY,
    width,
    height,
  };
}

function formatDuration(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds));
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}

/** Updates only the timer text; it does not notify or re-render the island activity store. */
export function CallElapsedTime({ startedAt }: { startedAt: number | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const elapsed = startedAt === null ? 0 : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return <>{formatDuration(elapsed)}</>;
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

/**
 * Round peer avatar: the first character of the name on a glass circle, the
 * same 62px round anchor the music card's cover gives its expanded card, so
 * the call card reads as one identity row instead of a name floating in a
 * black void. Tinted by phase: red while ringing, green while talking.
 */
function CallAvatar({ peer, phase }: { peer: string; phase: CallPhase }) {
  return (
    <span className={'qz-call-island-avatar' + (phase === 'incoming' ? ' is-ringing' : phase === 'in-call' ? ' is-active' : '')} aria-hidden="true">
      {peer.slice(0, 1)}
    </span>
  );
}

/** Header row: round avatar with the name and status right after it, like the player card. */
function CallExpandedHead({ peer, phase, phaseLabel, startedAt, muted }: {
  peer: string;
  phase: CallPhase;
  phaseLabel: string;
  startedAt: number | null;
  muted: boolean;
}) {
  return (
    <span className="qz-call-island-head">
      <CallAvatar peer={peer} phase={phase} />
      <span className="qz-call-island-meta">
        <span className="qz-call-island-kind">语音通话</span>
        <strong>{peer}</strong>
        <small>
          <span key={phase + ':' + (muted && phase === 'in-call')} className="qz-call-island-status">
            {phaseLabel}{muted && phase === 'in-call' ? ' · 已静音' : ''}
          </span>
          {phase === 'in-call' ? <> · <CallElapsedTime startedAt={startedAt} /></> : null}
        </small>
      </span>
    </span>
  );
}

function CallCollapseButton({ onCollapse }: { onCollapse: () => void }) {
  return (
    <button
      type="button"
      className="qz-call-island-close"
      aria-label="收起灵动岛"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.preventDefault(); event.stopPropagation(); onCollapse(); }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** Maps the existing WebRTC state machine to one high-priority island activity. */
export function createCallIslandActivity(input: CallIslandActivityInput): ActivityOptions {
  const { phase, peerName, startedAt, muted, speakerEnabled } = input;
  const phaseLabel = phase === 'incoming'
    ? '来电邀请'
    : phase === 'outgoing'
      ? '等待接听'
      : phase === 'connecting'
        ? '正在连接'
        : '通话中';
  const peer = peerName.trim() || '好友';
  const trailing = phase === 'connecting' ? '…' : peer.slice(0, 8);

  return {
    id: 'qz-call-session',
    onPress: input.onExpand,
    label: `${phaseLabel}，${peer}`,
    priority: 120,
    alert: phase === 'incoming',
    compact: {
      leading: (
        <span className={'qz-call-island-compact' + (phase === 'incoming' ? ' is-ringing' : phase === 'in-call' ? ' is-active' : '')}>
          <span className="qz-call-island-icon"><PhoneIcon /></span>
          <span key={phase} className="qz-call-island-phase-text">{phase === 'incoming' ? '来电' : phase === 'outgoing' ? '呼叫中' : phase === 'connecting' ? '连接中' : '通话'}</span>
        </span>
      ),
      trailing: (
        <span className="qz-call-island-time">
          {phase === 'in-call'
            ? <CallElapsedTime startedAt={startedAt} />
            : <span key={phase} className="qz-call-island-phase-text">{trailing}</span>}
        </span>
      ),
    },
    minimal: <span className="qz-call-island-minimal" aria-label={phaseLabel}><PhoneIcon /></span>,
    expanded: {
      leading: <CallExpandedHead peer={peer} phase={phase} phaseLabel={phaseLabel} startedAt={startedAt} muted={muted} />,
      trailing: <CallCollapseButton onCollapse={input.onCollapse} />,
      bottom: (
        <div className="qz-call-island-actions">
          {/* Each action keeps a stable key for what it does, not where it sits:
              when the phase changes, React unmounts the old button instead of
              reusing its node for a different action — so a fast double-tap on
              "接听" cannot land on "取消连接". The 300ms throttle in call.tsx
              (createCallActionThrottle) covers taps that arrive after the new
              button has already mounted. */}
          {phase === 'incoming' ? (
            <>
              <CallAction key="reject" label="拒绝" tone="danger" onAction={input.onReject} />
              <CallAction key="accept" label="接听" tone="primary" onAction={input.onAccept} />
            </>
          ) : phase === 'outgoing' ? (
            <CallAction key="cancel" label="取消呼叫" tone="danger" onAction={input.onCancel} />
          ) : phase === 'connecting' ? (
            <>
              <CallAction key="restore" label="返回通话" onAction={input.onRestore} />
              <CallAction key="cancel-connection" label="取消连接" tone="danger" onAction={input.onHangUp} />
            </>
          ) : (
            <>
              <CallAction key="restore" label="返回通话" onAction={input.onRestore} />
              <CallAction key="mute" label={muted ? '取消静音' : '静音'} onAction={input.onToggleMute} />
              <CallAction key="speaker" label={speakerEnabled ? '听筒' : '扬声器'} onAction={input.onToggleSpeaker} />
              <CallAction key="hangup" label="挂断" tone="danger" onAction={input.onHangUp} />
            </>
          )}
        </div>
      ),
    },
  };
}
