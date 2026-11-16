import { useEffect, useRef, useState } from 'react';
import type { ActivityTaskState } from '../lib/island';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useIsland, type Activity } from '../lib/island';
import './QianzhiIslandTaskDrawer.css';

export type IslandActivityCategory = '通话' | '音乐' | '通知' | '文件传输' | '网页活动';

export function resolveIslandTaskProgress(progress: number | null | undefined): number | null {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null;
  return Math.round(Math.max(0, Math.min(100, progress)));
}

export function resolveIslandTaskStatusLabel(status: ActivityTaskState['status']): string {
  if (status === 'done') return '已完成';
  if (status === 'error') return '失败';
  return '进行中';
}

/** Stable classification for the site's existing activity IDs. */
export function resolveIslandActivityCategory(id: string): IslandActivityCategory {
  const value = id.toLowerCase();
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
    case '文件传输': return '↑';
    default: return '◈';
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
      aria-label={`切换到：${activity.label}`}
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
  const [open, setOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastAnnouncementRef = useRef('');
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (docked || activities.length === 0) setOpen(false);
  }, [docked, activities.length]);

  // Notify background-task owners when the list is being inspected. Finished task
  // cards pause their auto-dismiss countdown until the user closes the list.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('qz-island-task-drawer-visibility', { detail: { open } }));
    return () => window.dispatchEvent(new CustomEvent('qz-island-task-drawer-visibility', { detail: { open: false } }));
  }, [open]);

  // Announce task starts and status changes, but not every percentage update.
  useEffect(() => {
    const signature = activities.map(activity => [
      activity.id,
      activity.label,
      activity.task?.status ?? '',
    ].join('|')).join('::');
    if (!signature || signature === lastAnnouncementRef.current) return;
    lastAnnouncementRef.current = signature;
    setAnnouncement(activities.map(activity => {
      const status = activity.task ? resolveIslandTaskStatusLabel(activity.task.status) : '正在运行';
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

  if (docked || keyboardOpen || activities.length === 0) return null;

  return (
    <div className="qz-island-task-ui" ref={rootRef}>
      <output className="qz-island-task-sr-only" aria-live="polite">{announcement}</output>
      <div className="qz-island-task-anchor">
        <button
          type="button"
          className="qz-island-task-trigger"
          aria-label={open ? '关闭活动列表' : `查看运行中的 ${activities.length} 项活动`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(value => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <path d="M8 9h8M8 12h8M8 15h5" />
          </svg>
          <span>{activities.length > 9 ? '9+' : activities.length}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && activities.length > 0 && (
          <motion.div
            className="qz-island-task-layer"
            initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <section className="qz-island-task-panel" role="dialog" aria-modal="false" aria-label="运行中的活动">
              <header className="qz-island-task-header">
                <div>
                  <strong>运行中的活动</strong>
                  <small>{activities.length} 项网页活动</small>
                </div>
                <button type="button" className="qz-island-task-close" onClick={() => setOpen(false)} aria-label="关闭活动列表">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              </header>
              <div className="qz-island-task-list">
                {activities.map(activity => (
                  <ActivityRow key={activity.id} activity={activity} onSelect={selectActivity} />
                ))}
              </div>
              <p className="qz-island-task-footnote">列表包含暂时未显示的活动。点按任意项目即可切换；通话、播放和传输仍由各自功能控制。</p>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
