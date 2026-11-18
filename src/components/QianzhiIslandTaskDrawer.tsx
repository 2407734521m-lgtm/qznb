import { useEffect, useRef, useState } from 'react';
import { createIslandTimerActivity, type IslandTimerSession } from './QianzhiIslandTimerActivity';
import type { ActivityTaskState } from '../lib/island';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useIsland, type Activity } from '../lib/island';
import './QianzhiIslandTaskDrawer.css';

export type IslandActivityCategory = '通话' | '音乐' | '通知' | '录音' | '计时器' | '文件传输' | '网页活动';

export function shouldRenderIslandTaskDrawer(docked: boolean, keyboardOpen: boolean): boolean {
  return !docked && !keyboardOpen;
}

export function resolveIslandTaskProgress(progress: number | null | undefined): number | null {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null;
  return Math.round(Math.max(0, Math.min(100, progress)));
}

export function resolveIslandTaskStatusLabel(status: ActivityTaskState['status']): string {
  if (status === 'done') return '已完成';
  if (status === 'error') return '失败';
  return '进行中';
}

/**
 * The row's accessible name. A plain aria-label would hide the row's visible
 * status, detail and progress text from screen readers, so the label carries
 * them: category, status, detail and — while running — the progress percentage.
 */
export function resolveIslandTaskAccessibleLabel(activity: Activity): string {
  const category = resolveIslandActivityCategory(activity.id);
  const task = activity.task;
  const status = task
    ? resolveIslandTaskStatusLabel(task.status)
    : activity.group ? '分组活动' : '正在运行';
  const parts = [`切换到：${activity.label}`, `${category} · ${status}`];
  if (task?.detail) parts.push(task.detail);
  const progress = resolveIslandTaskProgress(task?.progress);
  if (task?.status === 'running' && progress !== null) parts.push(`进度 ${progress}%`);
  return parts.join('，');
}

/** Stable classification for the site's existing activity IDs. */
export function resolveIslandActivityCategory(id: string): IslandActivityCategory {
  const value = id.toLowerCase();
  if (value.includes('timer') || value.includes('countdown')) return '计时器';
  if (value.includes('voice-recording') || value.includes('recording')) return '录音';
  if (value.includes('call')) return '通话';
  if (value.includes('music')) return '音乐';
  if (value.includes('alert') || value.includes('notification')) return '通知';
  if (value.includes('upload') || value.includes('download') || value.includes('transfer')) return '文件传输';
  return '网页活动';
}

function activitySymbol(category: IslandActivityCategory): string {
  switch (category) {
    case '通话': return '☎';
    case '音乐': return '♫';
    case '通知': return '•';
    case '录音': return '🎙';
    case '计时器': return '⏱';
    case '文件传输': return '↑';
    default: return '◈';
  }
}

const TIMER_SESSION_STORAGE_KEY = 'qz_island_timer_session_v1';

function readStoredTimerSession(): IslandTimerSession | null {
  try {
    const raw = localStorage.getItem(TIMER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<IslandTimerSession> & { mode?: unknown };
    if (
      (value.mode !== undefined && value.mode !== 'countdown')
      || (value.status !== 'running' && value.status !== 'paused' && value.status !== 'done')
      || !Number.isFinite(value.startedAt)
      || !Number.isFinite(value.durationMs)
      || !Number.isFinite(value.remainingMs)
    ) {
      // Clear saved sessions from the retired timer mode.
      localStorage.removeItem(TIMER_SESSION_STORAGE_KEY);
      return null;
    }
    const session = value as IslandTimerSession;
    if (session.status === 'running' && (!Number.isFinite(session.endsAt) || session.endsAt === null)) return null;
    if (session.status === 'running' && session.endsAt !== null && session.endsAt <= Date.now()) {
      return { ...session, status: 'done', endsAt: null, remainingMs: 0 };
    }
    return session;
  } catch {
    return null;
  }
}

function ActivityRow({ activity, onSelect }: { activity: Activity; onSelect: (id: string) => void }) {
  const category = resolveIslandActivityCategory(activity.id);
  const task = activity.task;
  const progress = resolveIslandTaskProgress(task?.progress);
  return (
    <button
      type="button"
      className="qz-island-task-row"
      onClick={() => onSelect(activity.id)}
      aria-label={resolveIslandTaskAccessibleLabel(activity)}
    >
      <span className="qz-island-task-symbol" aria-hidden="true">{activitySymbol(category)}</span>
      <span className="qz-island-task-copy">
        <strong>{activity.label}</strong>
        <small>{task ? category + ' · ' + resolveIslandTaskStatusLabel(task.status) : activity.group ? category + ' · 分组活动' : category + ' · 正在运行'}</small>
        {task?.detail && <small className="qz-island-task-detail">{task.detail}</small>}
        {task?.status === 'running' && (
          <span
            className="qz-island-task-progress"
            role="progressbar"
            aria-label={activity.label + '进度'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? undefined}
          >
            <i className={progress === null ? 'is-indeterminate' : ''} style={progress === null ? undefined : { width: progress + '%' }} />
          </span>
        )}
      </span>
      {task?.status === 'done' && <span className="qz-island-task-state is-done" aria-label="已完成">✓</span>}
      {task?.status === 'error' && <span className="qz-island-task-state is-error" aria-label="失败">!</span>}
      <span className="qz-island-task-switch">切换</span>
    </button>
  );
}

/**
 * A lightweight controller for the existing IslandProvider activity stack.
 * It deliberately switches activities instead of pretending that hiding a card
 * also cancels the underlying call, playback or file transfer.
 */
export default function QianzhiIslandTaskDrawer({ docked }: { docked: boolean }) {
  const island = useIsland();
  const activities = island.activities;
  const expanded = island.presentation === 'expanded';
  const [open, setOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const lastAnnouncementRef = useRef('');
  const [announcement, setAnnouncement] = useState('');
  const [timerDialogOpen, setTimerDialogOpen] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(15);
  const [timerSession, setTimerSession] = useState<IslandTimerSession | null>(() => readStoredTimerSession());
  const timerSessionRef = useRef<IslandTimerSession | null>(timerSession);
  timerSessionRef.current = timerSession;
  const timerActionsRef = useRef<{
    pause: () => void;
    resume: () => void;
    stop: () => void;
    complete: () => void;
  }>({ pause: () => {}, resume: () => {}, stop: () => {}, complete: () => {} });

  const persistTimerSession = (next: IslandTimerSession | null) => {
    timerSessionRef.current = next;
    setTimerSession(next);
    try {
      if (next) localStorage.setItem(TIMER_SESSION_STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(TIMER_SESSION_STORAGE_KEY);
    } catch { /* Timer still works for this page session when storage is unavailable. */ }
  };

  const completeTimer = () => {
    const current = timerSessionRef.current;
    if (!current || current.status !== 'running') return;
    persistTimerSession({ ...current, status: 'done', endsAt: null, remainingMs: 0 });
  };

  const stopTimer = () => {
    persistTimerSession(null);
    island.end('qz-island-timer');
  };

  const pauseTimer = () => {
    const current = timerSessionRef.current;
    if (!current || current.status !== 'running' || current.endsAt === null) return;
    const remainingMs = Math.max(0, current.endsAt - Date.now());
    if (remainingMs <= 0) { completeTimer(); return; }
    persistTimerSession({ ...current, status: 'paused', endsAt: null, remainingMs });
  };

  const resumeTimer = () => {
    const current = timerSessionRef.current;
    if (!current || current.status !== 'paused' || current.remainingMs <= 0) return;
    persistTimerSession({ ...current, status: 'running', endsAt: Date.now() + current.remainingMs });
  };

  const startTimer = (minutes?: number) => {
    const durationMinutes = Math.max(1, Math.min(240, Math.floor(minutes ?? 15)));
    const now = Date.now();
    const durationMs = durationMinutes * 60_000;
    persistTimerSession({ status: 'running', startedAt: now, durationMs, endsAt: now + durationMs, remainingMs: durationMs });
    setTimerDialogOpen(false);
    setOpen(false);
  };

  const openTimerSetup = () => {
    setTimerMinutes(15);
    setTimerDialogOpen(true);
  };

  const handleTimerEntry = () => {
    const current = timerSessionRef.current;
    if (current && (current.status === 'running' || current.status === 'paused')) {
      island.expand('qz-island-timer');
      setOpen(false);
      return;
    }
    openTimerSetup();
  };

  timerActionsRef.current = {
    pause: pauseTimer,
    resume: resumeTimer,
    stop: stopTimer,
    complete: completeTimer,
  };

  useEffect(() => {
    if (!timerSession) {
      island.end('qz-island-timer');
      return;
    }
    island.start(createIslandTimerActivity({
      session: timerSession,
      onPress: () => island.expand('qz-island-timer'),
      onPause: () => timerActionsRef.current.pause(),
      onResume: () => timerActionsRef.current.resume(),
      onStop: () => timerActionsRef.current.stop(),
      onComplete: () => timerActionsRef.current.complete(),
    }));
  }, [timerSession, island]);

  useEffect(() => {
    if (!timerSession || timerSession.status !== 'running' || timerSession.endsAt === null) return;
    const checkDeadline = () => {
      const current = timerSessionRef.current;
      if (current && current.status === 'running' && current.endsAt !== null && Date.now() >= current.endsAt) {
        timerActionsRef.current.complete();
      }
    };
    const timer = window.setInterval(checkDeadline, 1000);
    document.addEventListener('visibilitychange', checkDeadline);
    checkDeadline();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkDeadline);
    };
  }, [timerSession?.status, timerSession?.endsAt]);

  const hasCallActivity = activities.some(activity => activity.id === 'qz-call-session' || activity.id === 'qz-group-call-session');

  useEffect(() => {
    if (docked || (hasCallActivity && expanded)) setOpen(false);
  }, [docked, hasCallActivity, expanded]);

  // The pill is wider than its 104px config width (sensor + content: ~200px
  // with a track, ~400px expanded), so a trigger parked at a fixed offset
  // from the config anchor lands on the pill. Track the pill's real
  // half-width and park the trigger just past its right edge; 52px is the
  // config-width fallback when the pill is not in the DOM yet.
  useEffect(() => {
    const anchor = anchorRef.current;
    const root = rootRef.current;
    if (!anchor || !root || typeof ResizeObserver === 'undefined') return;
    const pill = document.querySelector('[data-islandcn-hit="pill"]');
    if (!(pill instanceof HTMLElement)) return;
    const sync = () => {
      const rect = pill.getBoundingClientRect();
      anchor.style.setProperty('--qz-island-pill-half', (rect.width / 2) + 'px');
      // Keep the activity panel below the capsule in both compact and expanded layouts.
      const panelTop = Math.min(rect.bottom + 18, Math.max(12, window.innerHeight * 0.42));
      root.style.setProperty('--qz-island-task-panel-top', panelTop + 'px');
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(pill);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      root.style.removeProperty('--qz-island-task-panel-top');
    };
  }, [activities.length, expanded]);

  // Notify background-task owners when the list is being inspected. Finished task
  // cards pause their auto-dismiss countdown until the user closes the list.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('qz-island-task-drawer-visibility', { detail: { open } }));
    return () => {
      window.dispatchEvent(new CustomEvent('qz-island-task-drawer-visibility', { detail: { open: false } }));
    };
  }, [open]);

  // Announce background-task starts and status changes, but not unrelated calls/messages
  // and not every percentage update.
  useEffect(() => {
    const taskActivities = activities.filter(activity => activity.task);
    const signature = taskActivities.map(activity => [
      activity.id,
      activity.label,
      activity.task?.status ?? '',
    ].join('|')).join('::');
    if (signature === lastAnnouncementRef.current) return;
    lastAnnouncementRef.current = signature;
    if (!signature) return;
    setAnnouncement(taskActivities.map(activity => {
      const status = resolveIslandTaskStatusLabel(activity.task!.status);
      return activity.label + '，' + status;
    }).join('；'));
  }, [activities]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const syncKeyboardState = () => {
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const openNow = window.innerHeight - visibleHeight > 140;
      setKeyboardOpen(openNow);
      if (openNow) setOpen(false);
    };
    syncKeyboardState();
    viewport?.addEventListener('resize', syncKeyboardState);
    window.addEventListener('resize', syncKeyboardState);
    window.addEventListener('orientationchange', syncKeyboardState);
    return () => {
      viewport?.removeEventListener('resize', syncKeyboardState);
      window.removeEventListener('resize', syncKeyboardState);
      window.removeEventListener('orientationchange', syncKeyboardState);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onVisibilityChange = () => { if (document.visibilityState !== 'visible') setOpen(false); };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectActivity = (id: string) => {
    island.expand(id);
    setOpen(false);
  };

  if (!shouldRenderIslandTaskDrawer(docked, keyboardOpen)) return null;

  return (
    <div className={'qz-island-task-ui' + (activities.some(activity => activity.id === 'qz-route-navigation') ? ' has-route-indicator' : '')} ref={rootRef}>
      <output className="qz-island-task-sr-only" aria-live="polite">{announcement}</output>
      <div className="qz-island-task-anchor" ref={anchorRef}>
        <button
          type="button"
          className="qz-island-task-trigger"
          aria-label={open ? '关闭活动列表' : activities.length ? `查看运行中的 ${activities.length} 项活动` : '打开任务中心'}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(value => !value)}
        >
          {activities.length ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <path d="M8 9h8M8 12h8M8 15h5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.8 1.8M9 2h6M12 2v3" />
            </svg>
          )}
          {activities.length > 0 && <span>{activities.length > 9 ? '9+' : activities.length}</span>}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="qz-island-task-layer"
            initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <section className="qz-island-task-panel" role="dialog" aria-modal="false" aria-label="任务中心">
              <header className="qz-island-task-header">
                <div>
                  <strong>任务中心</strong>
                  <small>{activities.length} 项运行中的活动</small>
                </div>
                <div className="qz-island-task-header-actions">
                  <button type="button" className="qz-island-task-timer-button" onClick={handleTimerEntry}>
                    {timerSession && (timerSession.status === 'running' || timerSession.status === 'paused') ? '查看倒计时' : '新建倒计时'}
                  </button>
                  <button type="button" className="qz-island-task-close" onClick={() => setOpen(false)} aria-label="关闭任务中心">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              </header>
              {activities.length ? (
                <div className="qz-island-task-list">
                  {activities.map(activity => (
                    <ActivityRow key={activity.id} activity={activity} onSelect={selectActivity} />
                  ))}
                </div>
              ) : (
                <div className="qz-island-task-empty">
                  <span className="qz-island-task-empty-icon">⏱</span>
                  <strong>暂时没有运行中的活动</strong>
                  <small>设置自定义倒计时，活动开始后会显示在灵动岛上</small>
                  <div>
                    <button type="button" onClick={openTimerSetup}>自定义倒计时</button>
                  </div>
                </div>
              )}
              {activities.length > 0 && <p className="qz-island-task-footnote">列表包含暂时未显示的活动。点按任意项目即可切换；通话、播放和传输仍由各自功能控制。</p>}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
      {timerDialogOpen && (
        <div className="qz-island-timer-dialog-backdrop" role="presentation" onClick={() => setTimerDialogOpen(false)}>
          <section className="qz-island-timer-dialog" role="dialog" aria-modal="true" aria-label="设置倒计时" onClick={event => event.stopPropagation()}>
            <header>
              <div><strong>设置倒计时</strong><small>计时结束后会显示在灵动岛上</small></div>
              <button type="button" aria-label="关闭倒计时设置" onClick={() => setTimerDialogOpen(false)}>×</button>
            </header>
            <label className="qz-island-timer-minutes">
              <span>倒计时时长（分钟）</span>
              <input type="number" inputMode="numeric" min={1} max={240} step={1} value={timerMinutes} onChange={event => setTimerMinutes(Math.max(1, Math.min(240, Number(event.target.value) || 1)))} />
              <small>可设置 1–240 分钟</small>
            </label>
            <footer>
              <button type="button" onClick={() => setTimerDialogOpen(false)}>取消</button>
              <button type="button" className="is-primary" onClick={() => startTimer(timerMinutes)}>开始计时</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
