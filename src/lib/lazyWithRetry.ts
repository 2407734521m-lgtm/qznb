// 懒加载分块加载失败自动恢复。
//
// 背景：GitHub Pages 新部署后只保留最新构建的文件，旧哈希分块（如
// Explore-1j4THEGL.js）会被删掉。用户浏览器里若还缓存着旧部署的入口，
// 点进懒加载页面时去取已不存在的旧分块，就会 404，React.lazy 直接抛
// “Failed to fetch dynamically imported module”，页面只剩报错死路，
// 点刷新重试后拿到新入口才恢复。
//
// 注意：线上已有的 retry-*.js 分块只是 src/lib/retry.ts（Supabase 请求
// 重试）的共享分块，对分块加载失败不起作用，所以这里单独做一套。
//
// 恢复分两层，共用同一个 60 秒防抖标记，全站 60 秒内最多自动硬刷新一次，
// 不会死循环：
//  1. 导入处（lazyWithRetry）：分块失败先等 400ms 原样再取一次，网络抖动
//     造成的失败这一步就恢复了，不用整页刷新；
//  2. 错误边界（ErrorBoundary）：仍失败就整页硬刷新一次取新入口；
//     自动恢复也失败时才显示“页面加载失败”与手动重试按钮。
// 非分块错误（模块里自己抛的错）不走这套，原样抛出。
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// 自动硬刷新的防抖标记：sessionStorage 按标签页隔离，多标签页互不影响。
export const CHUNK_RELOAD_KEY = 'qz_chunk_reload_at';
const RELOAD_GUARD_MS = 60_000;

// 分块加载失败的报错特征：Vite 动态 import 404 时的固定文案（含各浏览器
// 变体与 webpack 风格的 ChunkLoadError）。只认这些，不认业务报错。
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|ChunkLoadError/i.test(
    message,
  );
}

// 60 秒内没自动刷新过就打上标记并返回 true；反之返回 false（不刷新）。
export function tryMarkChunkReload(): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export async function loadWithChunkRetry<T>(
  importFn: () => Promise<T>,
): Promise<T> {
  try {
    return await importFn();
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;
    // 第 1 步：网络抖动也可能让分块取失败，短暂等待后原样再取一次。
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return await importFn();
    } catch (retryError) {
      if (!isChunkLoadError(retryError)) throw retryError;
      // 第 2 步：两次都取不到，基本是旧部署分块已删。整页硬刷新一次，
      // 浏览器会重新取入口 index.html，拿到新哈希的分块就能打开。
      // 60 秒内只刷新一次；刷新后仍失败就交给错误边界显示手动重试。
      try {
        if (tryMarkChunkReload()) window.location.reload();
      } catch {
        /* 刷新失败也不吞错，继续走错误边界的手动重试 */
      }
      throw retryError;
    }
  }
}

// React.lazy 的直接替代：全站所有懒加载页面/覆盖层都走这里。
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => loadWithChunkRetry(importFn));
}
