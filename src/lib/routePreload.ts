// 路由分块预热：导航意图一出现就提前取目标页的分块，暖好浏览器模块缓存，
// 切页时 React.lazy 直接命中缓存，不用在 Suspense 里从零等分块。
//
// 背景：切页白屏 2–4 秒就是分块下载时间。AnimatePresence 先淡出旧页，
// 新页挂上时分块没到，fallback 只能干等。预热把下载提前到用户手指落下
// （Dock/会话行 pointerdown）、桌面悬停、以及空闲时（常去的 Dock 三栏、
// 进消息中心后大概率要点的聊天页），让等待发生在用户还没点之前。
//
// 注意：预热只调原始 import()，失败就吞掉并清掉标记——后面 React.lazy
// 走自己的 loadWithChunkRetry，不会被预热的失败拖累，也不会触发硬刷新。

export type RouteLoader = () => Promise<unknown>;

export interface PreloadEntry {
  /** 匹配目标路径（Dock 栏用精确路径，消息中心/私聊用前缀）。 */
  pattern: RegExp;
  key: string;
  load: RouteLoader;
}

export function createRoutePreloader(entries: PreloadEntry[]) {
  const warmed = new Set<string>();

  function match(pathname: string): PreloadEntry | undefined {
    return entries.find((entry) => entry.pattern.test(pathname));
  }

  /** 预热成功返回 true；没命中、已暖过返回 false（不重复取）。 */
  function preload(pathname: string): boolean {
    const entry = match(pathname);
    if (!entry || warmed.has(entry.key)) return false;
    warmed.add(entry.key);
    entry.load().catch(() => {
      warmed.delete(entry.key);
    });
    return true;
  }

  return { match, preload, warmed };
}

// 与 App.tsx 里 lazyWithRetry 完全相同的 import 表达式，
// 解析到同一个模块，分块也就是同一份，预热才暖得到。
export const ROUTE_PRELOAD_ENTRIES: PreloadEntry[] = [
  { pattern: /^\/(friends|messages)/, key: 'friends', load: () => import('../pages/Friends') },
  { pattern: /^\/chat\//, key: 'chat', load: () => import('../pages/Chat') },
  { pattern: /^\/home$/, key: 'home', load: () => import('../pages/Home') },
  { pattern: /^\/explore$/, key: 'explore', load: () => import('../pages/Explore') },
  { pattern: /^\/feed$/, key: 'discover', load: () => import('../pages/Discover') },
  { pattern: /^\/me$/, key: 'me', load: () => import('../pages/MeHub') },
];

export const { preload: preloadRoute } = createRoutePreloader(ROUTE_PRELOAD_ENTRIES);
