import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_KEY,
  isChunkLoadError,
  loadWithChunkRetry,
  tryMarkChunkReload,
} from '../lazyWithRetry';

function chunkError() {
  return new Error(
    'Failed to fetch dynamically imported module: https://qianzhi.pw/assets/Explore-1j4THEGL.js',
  );
}

describe('isChunkLoadError', () => {
  it('认出 Vite 动态 import 404 的报错', () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true);
  });

  it('业务报错不是分块错误', () => {
    expect(isChunkLoadError(new Error('Network Error'))).toBe(false);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch')).toBe(false);
  });
});

describe('loadWithChunkRetry（带假 window，测自动刷新防抖）', () => {
  const reload = vi.fn();
  let store: Map<string, string>;
  const realWindow = (globalThis as any).window;

  beforeEach(() => {
    reload.mockClear();
    store = new Map();
    (globalThis as any).window = {
      location: { reload },
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
  });

  afterEach(() => {
    if (realWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = realWindow;
  });

  it('第一次就成功，不刷新', async () => {
    const importFn = vi.fn().mockResolvedValue({ default: 'ok' });
    await expect(loadWithChunkRetry(importFn)).resolves.toEqual({ default: 'ok' });
    expect(importFn).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('分块失败一次、第二次取到，不刷新', async () => {
    const importFn = vi
      .fn()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValue({ default: 'ok' });
    await expect(loadWithChunkRetry(importFn)).resolves.toEqual({ default: 'ok' });
    expect(importFn).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('两次都取不到分块：自动硬刷新一次并抛错', async () => {
    const importFn = vi.fn().mockRejectedValue(chunkError());
    await expect(loadWithChunkRetry(importFn)).rejects.toThrow('Failed to fetch dynamically imported module');
    expect(importFn).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.get(CHUNK_RELOAD_KEY)).toBeTruthy();
  });

  it('60 秒内再次失败：不再自动刷新，只抛错（防死循环）', async () => {
    const importFn = vi.fn().mockRejectedValue(chunkError());
    await expect(loadWithChunkRetry(importFn)).rejects.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);
    await expect(loadWithChunkRetry(importFn)).rejects.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('非分块错误：不重试、不刷新，原样抛', async () => {
    const importFn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(loadWithChunkRetry(importFn)).rejects.toThrow('boom');
    expect(importFn).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('tryMarkChunkReload：无 window 时返回 false', () => {
    delete (globalThis as any).window;
    expect(tryMarkChunkReload()).toBe(false);
  });
});
