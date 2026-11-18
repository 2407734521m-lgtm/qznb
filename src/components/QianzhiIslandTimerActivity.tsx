import { useEffect, useRef, useState } from 'react';
import type { ActivityOptions } from '../lib/island';
import './QianzhiIslandTimerActivity.css';

export type IslandTimerStatus = 'running' | 'paused' | 'done';

export interface IslandTimerSession {
  status: IslandTimerStatus;
  startedAt: number;
  durationMs: number;
  endsAt: number | null;
  remainingMs: number;
}

export function getIslandTimerRemainingMs(session: IslandTimerSession, now = Date.now()): number {
  if (session.status === 'done') return 0;
  if (session.status === 'paused' || session.endsAt === null) return Math.max(0, session.remainingMs);
  return Math.max(0, session.endsAt - now);
}

export function formatIslandTimerRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(Number.isFinite(milliseconds) ? milliseconds / 1000 : 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function TimerClock({ session, large = false, onComplete }: {
  session: IslandTimerSession;
  large?: boolean;
  onComplete: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (session.status !== 'running' || session.endsAt === null) return;
    let completed = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (!completed && current >= session.endsAt!) {
        completed = true;
        onCompleteRef.current();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [session.status, session.endsAt]);

  const remaining = getIslandTimerRemainingMs(session, now);
  return (
    <time
      className={'qz-island-timer-clock' + (large ? ' is-large' : '') + (session.status === 'done' ? ' is-done' : '')}
      aria-label={'剩余时间 ' + formatIslandTimerRemaining(remaining)}
    >
      {formatIslandTimerRemaining(remaining)}
    </time>
  );
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.8 1.8M9 2h6M12 2v3" />
    </svg>
  );
}

function TimerButton({ label, onClick, tone = 'neutral' }: {
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'primary' | 'danger';
}) {
  return (
    <button
      type="button"
      className={'qz-island-timer-action is-' + tone}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.preventDefault(); event.stopPropagation(); onClick(); }}
    >
      {label}
    </button>
  );
}

function TimerControls({ session, onPause, onResume, onStop, onStartBreak }: {
  session: IslandTimerSession;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  if (session.status === 'done') {
    return (
      <div className="qz-island-timer-actions">
        <TimerButton label="关闭" onClick={onStop} />
      </div>
    );
  }
  return (
    <div className="qz-island-timer-actions">
      {session.status === 'running'
        ? <TimerButton label="暂停" onClick={onPause} tone="primary" />
        : <TimerButton label="继续" onClick={onResume} tone="primary" />}
      <TimerButton label="结束" onClick={onStop} tone="danger" />
    </div>
  );
}

function timerStatus(status: IslandTimerStatus): string {
  if (status === 'done') return '已完成';
  if (status === 'paused') return '已暂停';
  return '倒计时中';
}

export function createIslandTimerActivity(input: {
  session: IslandTimerSession;
  onPress: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onStartBreak: () => void;
  onComplete: () => void;
}): ActivityOptions {
  const { session } = input;
  const title = '倒计时';
  const status = timerStatus(session.status);
  const label = title + ' · ' + status;
  const durationMinutes = Math.max(1, Math.round(session.durationMs / 60000));

  return {
    id: 'qz-island-timer',
    label,
    priority: 36,
    alert: session.status === 'done',
    onPress: input.onPress,
    task: {
      status: session.status === 'done' ? 'done' : 'running',
      detail: session.status === 'paused'
        ? '已暂停 · ' + durationMinutes + ' 分钟'
        : session.status === 'done'
          ? '计时已结束'
          : title + ' · ' + durationMinutes + ' 分钟',
    },
    compact: {
      leading: (
        <span className={'qz-island-timer-compact' + (session.status === 'done' ? ' is-done' : '')}>
          <span className="qz-island-timer-icon"><TimerIcon /></span>
          <span>{session.status === 'done' ? '时间到' : '倒计时'}</span>
        </span>
      ),
      trailing: <TimerClock session={session} onComplete={input.onComplete} />,
    },
    minimal: <span className="qz-island-timer-minimal"><TimerIcon /></span>,
    expanded: {
      leading: (
        <span className="qz-island-timer-expanded-head">
          <span className="qz-island-timer-icon is-large"><TimerIcon /></span>
          <span className="qz-island-timer-expanded-copy">
            <strong>{title}</strong>
            <small>{status} · 共 {durationMinutes} 分钟</small>
          </span>
        </span>
      ),
      center: <TimerClock session={session} large onComplete={input.onComplete} />,
      bottom: (
        <TimerControls
          session={session}
          onPause={input.onPause}
          onResume={input.onResume}
          onStop={input.onStop}
        />
      ),
    },
  };
}
