import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timeAgo } from '../time';

const NOW = new Date('2026-11-14T12:00:00+08:00').getTime();
const isoAgo = (ms: number) => new Date(NOW - ms).toISOString();

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('60 秒内显示“刚刚”', () => {
    expect(timeAgo(isoAgo(0))).toBe('刚刚');
    expect(timeAgo(isoAgo(59 * 1000))).toBe('刚刚');
  });

  it('分钟 / 小时 / 天按整值进位', () => {
    expect(timeAgo(isoAgo(90 * 1000))).toBe('1 分钟前');
    expect(timeAgo(isoAgo(59 * 60 * 1000))).toBe('59 分钟前');
    expect(timeAgo(isoAgo(2 * 3600 * 1000))).toBe('2 小时前');
    expect(timeAgo(isoAgo(23 * 3600 * 1000))).toBe('23 小时前');
    expect(timeAgo(isoAgo(3 * 86400 * 1000))).toBe('3 天前');
    expect(timeAgo(isoAgo(29 * 86400 * 1000))).toBe('29 天前');
  });

  it('30 天以上显示日期（与 toLocaleDateString 一致）', () => {
    const old = isoAgo(40 * 86400 * 1000);
    expect(timeAgo(old)).toBe(new Date(old).toLocaleDateString());
    expect(timeAgo(old)).not.toContain('前');
  });
});
