// 极简路由数据缓存：切页复用 + 导航预取共用。
// 只放内存里，切页回来立刻有内容；刷新页面重新拉取。
// TTL 到期自动失效；本地改动（发布/编辑/删除/下拉刷新）要主动 invalidate。
// 注意：只缓存“别人也能看到的公开首屏”，登录态私有的 mine 列表不进这里。

export const ROUTE_DATA_TTL_MS = 5 * 60 * 1000;

type Entry = { at: number; value: unknown };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function readRouteDataCache<T>(key: string, ttlMs: number = ROUTE_DATA_TTL_MS): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function writeRouteDataCache<T>(key: string, value: T): void {
  cache.set(key, { at: Date.now(), value });
}

/** 精确 key 或按前缀批量清（例如 'feed-first:' 清掉该栏全部搜索词缓存）。 */
export function invalidateRouteDataCache(keyOrPrefix: string): void {
  for (const key of [...cache.keys()]) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) cache.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) inflight.delete(key);
  }
}

/**
 * 有缓存直接返回；没有就拉一次，并发请求合并成同一份
 * （导航预取和挂载共用同一份在途请求，不重复发）。
 */
export async function fetchRouteData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = ROUTE_DATA_TTL_MS,
): Promise<T> {
  const hit = readRouteDataCache<T>(key, ttlMs);
  if (hit !== null) return hit;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const task = fetcher().then(
    (value) => {
      writeRouteDataCache(key, value);
      inflight.delete(key);
      return value;
    },
    (err) => {
      inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, task);
  return task;
}

/** 导航预取：只管暖缓存，失败静默（挂载时再正常拉取）。 */
export function prefetchRouteData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = ROUTE_DATA_TTL_MS,
): void {
  void fetchRouteData(key, fetcher, ttlMs).catch(() => {});
}
