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
  { pattern: /^\/love-wall$/, key: 'love-wall', load: () => import('../pages/LoveWall') },
  { pattern: /^\/board$/, key: 'board', load: () => import('../pages/Board') },
  { pattern: /^\/daily$/, key: 'daily', load: () => import('../pages/Daily') },
  { pattern: /^\/topics$/, key: 'topics', load: () => import('../pages/Topics') },
];

export const { preload: preloadRoute } = createRoutePreloader(ROUTE_PRELOAD_ENTRIES);

/**
 * 等目标分块暖好再切页用：返回一个 promise，分块已在缓存里时立刻兑现，
 * 不在预热表里时也立刻兑现（调用方直接切页，走原来的 Suspense 逻辑）。
 * 失败也兑现，不让一次失败的分块把用户卡在旧页上。
 */
export function warmRoute(pathname: string): Promise<void> {
  const entry = ROUTE_PRELOAD_ENTRIES.find((item) => item.pattern.test(pathname));
  if (!entry) return Promise.resolve();
  return entry.load().then(
    () => undefined,
    () => undefined,
  );
}

// 导航数据预取：手指按下/悬停时先把目标页的首屏数据拉进缓存，
// 切页挂载直接命中，不用等挂载后再从零拉数据。失败静默，挂载时正常重拉。
// 动态 import 与页面里已有的 import 解析到同一分块，不会多下一份代码。
// 返回的 promise 在预取落定后兑现（未知路径立刻兑现），供切页等待用：
// 只等分块不等数据的话，页一挂上还是骨架；分块+数据一起等满，旧页才能
// 一直留到新页真正能画出来为止（调用方另有 1200ms 上限兜底）。
export function preloadRouteData(pathname: string): Promise<void> {
  if (pathname === '/feed') {
    return import('../components/PostList')
      .then((m) => m.prefetchFeedFirstPage('feed', ''))
      .then(() => undefined, () => undefined);
  } else if (pathname === '/love-wall') {
    return import('../pages/LoveWall')
      .then((m) => m.prefetchLoveWallData())
      .then(() => undefined, () => undefined);
  }
  return Promise.resolve();
}
