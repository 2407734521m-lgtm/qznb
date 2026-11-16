import { describe, expect, it } from 'vitest';
import { ME_QUICK_ENTRIES } from './meQuickEntries';

const ME_ID = '00000000-0000-0000-0000-000000000001';

describe('ME_QUICK_ENTRIES', () => {
  it('一共 8 个入口，顺序固定', () => {
    expect(ME_QUICK_ENTRIES.map((entry) => entry.label)).toEqual([
      '我的主页', '编辑资料', '我的相册', '内容日历',
      '热门特效', '我的留言', '活动', '我的内容管理',
    ]);
  });

  it('每个入口都指到站内已有的路由', () => {
    expect(ME_QUICK_ENTRIES.map((entry) => entry.href(ME_ID))).toEqual([
      `/members/${ME_ID}`,
      '/me/edit?sec=base',
      '/albums',
      '/calendar',
      '/hot',
      '/me/greetings',
      '/events',
      '/me/content',
    ]);
  });

  it('标签与图标都不重复、不为空', () => {
    const labels = ME_QUICK_ENTRIES.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(ME_QUICK_ENTRIES.every((entry) => entry.label.trim() && entry.icon.trim())).toBe(true);
  });
});
