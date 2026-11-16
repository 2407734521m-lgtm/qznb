import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useIslandActions, type ActivityOptions } from '../lib/island';
import { NavigationActivityScheduler } from '../lib/island/navigation-activity-scheduler';
import './QianzhiIslandNavigationActivity.css';

const ACTIVITY_ID = 'qz-route-navigation';

const navigationActivityScheduler = new NavigationActivityScheduler<number>({
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle),
});

export function routeActivityLabel(pathname: string): string {
  if (pathname.startsWith('/chat/')) return '私聊';
  if (pathname.startsWith('/friends')) return '好友';
  if (pathname.startsWith('/me')) return '个人中心';
  if (pathname.startsWith('/music')) return '音乐空间';
  if (pathname.startsWith('/explore') || pathname.startsWith('/feed')) return '发现';
  if (pathname.startsWith('/home') || pathname === '/') return '首页';
  if (pathname.startsWith('/timeline')) return '动态';
  if (pathname.startsWith('/albums')) return '相册';
  if (pathname.startsWith('/love-wall')) return '表白墙';
  return '页面';
}

type NavigationStatus = 'loading' | 'success';

function NavigationStatusIcon({ status, className }: { status: NavigationStatus; className: string }) {
  const label = status === 'success' ? '打开成功' : '正在加载';
  return (
    <span className={className} data-state={status} role="img" aria-label={label}>
      <i aria-hidden="true" />
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12.5 4.4 4.4L19 7.3" />
      </svg>
    </span>
  );
}

export function createNavigationIslandActivity(label: string, status: NavigationStatus = 'loading'): ActivityOptions {
  const completed = status === 'success';
  const actionText = completed ? '已打开' : '正在打开';

  return {
    id: ACTIVITY_ID,
    label: actionText + label,
    priority: 14,
    compact: {
      leading: <span className="qz-island-navigation-compact">{actionText}</span>,
      trailing: <NavigationStatusIcon status={status} className="qz-island-navigation-trail" />,
    },
    minimal: <NavigationStatusIcon status={status} className="qz-island-navigation-minimal" />,
    expanded: {
      leading: <span className="qz-island-navigation-label">页面切换</span>,
      trailing: <NavigationStatusIcon status={status} className="qz-island-navigation-expanded-status" />,
      center: (
        <span className="qz-island-navigation-copy">
          <strong>{actionText}{label}</strong>
          <small>{completed ? '页面已就绪' : '正在加载页面内容'}</small>
        </span>
      ),
      ...(completed ? {} : {
        bottom: <span className="qz-island-navigation-progress" role="progressbar" aria-label="页面加载中"><i /></span>,
      }),
    },
  };
}

/** Mounted only while React Router is waiting for a lazy route chunk. */
export default function QianzhiIslandNavigationActivity() {
  const island = useIslandActions();
  const location = useLocation();
  const label = routeActivityLabel(location.pathname);
  const latestLabel = useRef(label);
  latestLabel.current = label;

  // The scheduler is shared across fallback mounts so adjacent route loads can merge.
  useEffect(() => {
    const sink = {
      show: (nextLabel: string) => {
        island.start(createNavigationIslandActivity(nextLabel, 'loading'));
      },
      complete: () => {
        // The route is ready: replace the spinner with a check without restarting the activity.
        island.start(createNavigationIslandActivity(latestLabel.current, 'success'));
      },
      end: () => island.end(ACTIVITY_ID),
    };
    navigationActivityScheduler.enter(sink, latestLabel.current);
    return () => navigationActivityScheduler.leave();
  }, [island]);

  // A new destination updates the existing activity instead of restarting its visibility timer.
  useEffect(() => {
    navigationActivityScheduler.update(label);
  }, [label]);

  return null;
}
