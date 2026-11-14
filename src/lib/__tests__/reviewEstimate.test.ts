import { describe, expect, it, vi } from 'vitest';

// reviewEstimate.ts 顶部 import 的 supabase.ts 会在模块加载时读 window，
// Node 环境下直接 import 会炸；estimateText 是纯函数，
// 这里把 supabase 客户端 mock 掉，只测 estimateText。
vi.mock('../supabase', () => ({
  supabase: { rpc: vi.fn() },
  supabaseBaseUrl: 'http://localhost',
  supabaseAnonKey: 'test',
  configured: false,
}));

import { estimateText, type ReviewEstimateItem } from '../reviewEstimate';

function item(ahead: number): ReviewEstimateItem {
  return { kind: 'love', id: 'x', created_at: '2026-11-14T00:00:00Z', ahead, total: ahead + 1 };
}

describe('estimateText', () => {
  it('管理员不在线时给兜底说法', () => {
    expect(estimateText(item(0), false)).toBe('排队第 1 位 · 管理员暂时不在线，预计今晚睡前处理');
    expect(estimateText(item(9), false)).toBe('排队第 10 位 · 管理员暂时不在线，预计今晚睡前处理');
  });

  it('管理员在线时按前方条数分档', () => {
    expect(estimateText(item(0), true)).toBe('排队第 1 位 · 预计 10 分钟左右审核');
    expect(estimateText(item(2), true)).toBe('排队第 3 位 · 预计 10 分钟左右审核');
    expect(estimateText(item(3), true)).toBe('排队第 4 位 · 预计 30 分钟左右审核');
    expect(estimateText(item(5), true)).toBe('排队第 6 位 · 预计 30 分钟左右审核');
    expect(estimateText(item(6), true)).toBe('排队第 7 位 · 预计 1 小时左右审核');
  });
});
