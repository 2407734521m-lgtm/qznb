import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useIslandActions, type ActivityOptions } from '../lib/island';
import './QianzhiIslandNavigationActivity.css';

const ACTIVITY_ID = 'qz-route-navigation';
let pendingEndTimer: number | null = null;

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

export function createNavigationIslandActivity(label: string): ActivityOptions {
  return {
    id: ACTIVITY_ID,
    label: '正在打开' + label,
    priority: 14,
    compact: {
      leading: <span className="qz-island-navigation-compact"><i aria-hidden="true" />正在打开</span>,
      trailing: <span className="qz-island-navigation-trail" aria-hidden="true"><i /><i /><i /></span>,
    },
    minimal: <span className="qz-island-navigation-minimal" aria-label="正在打开页面"><i /></span>,
    expanded: {
      leading: <span className="qz-island-navigation-label">页面切换</span>,
      center: (
        <span className="qz-island-navigation-copy">
          <strong>正在打开{label}</strong>
          <small>正在加载页面内容</small>
        </span>
      ),
      bottom: <span className="qz-island-navigation-progress" role="progressbar" aria-label="页面加载中"><i /></span>,
    },
  };
}

/** Mounted only while React Router is waiting for a lazy route chunk. */
export default function QianzhiIslandNavigationActivity() {
  const island = useIslandActions();
  const location = useLocation();

  useEffect(() => {
    if (pendingEndTimer !== null) {
      window.clearTimeout(pendingEndTimer);
      pendingEndTimer = null;
    }

    const label = routeActivityLabel(location.pathname);
    const startTimer = window.setTimeout(() => {
      island.start(createNavigationIslandActivity(label));
    }, 180);

    return () => {
      window.clearTimeout(startTimer);
      if (pendingEndTimer !== null) window.clearTimeout(pendingEndTimer);
      pendingEndTimer = window.setTimeout(() => {
        pendingEndTimer = null;
        island.end(ACTIVITY_ID);
      }, 140);
    };
  }, [island, location.pathname]);

  return null;
}
