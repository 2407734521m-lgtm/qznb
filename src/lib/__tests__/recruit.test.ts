import { describe, expect, it } from 'vitest';
import {
  applicationTimelineSteps,
  departmentColor,
  formatDateTime,
  isFavoritePositionId,
  loadFavoritePositionIds,
  toggleFavoritePositionId,
} from '../recruitHelpers';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

describe('formatDateTime', () => {
  it('输出年月日时分（按本机时区换算）', () => {
    const d = new Date('2026-11-30T14:30:00+08:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(formatDateTime('2026-11-30T14:30:00+08:00')).toBe(expected);
  });

  it('空值与非法值返回破折号', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
  });
});

describe('收藏（localStorage）', () => {
  it('空存储读出空数组', () => {
    expect(loadFavoritePositionIds(fakeStorage())).toEqual([]);
  });

  it('切换收藏会写入并读回', () => {
    const store = fakeStorage();
    expect(toggleFavoritePositionId(3, store)).toBe(true);
    expect(isFavoritePositionId(3, store)).toBe(true);
    expect(loadFavoritePositionIds(store)).toEqual([3]);
    expect(toggleFavoritePositionId(3, store)).toBe(false);
    expect(isFavoritePositionId(3, store)).toBe(false);
  });

  it('脏数据不报错，只返回合法数字', () => {
    const store = fakeStorage();
    store.setItem('rj_fav_positions_v1', 'not-json');
    expect(loadFavoritePositionIds(store)).toEqual([]);
    store.setItem('rj_fav_positions_v1', JSON.stringify([1, 'x', 2.5, 4]));
    expect(loadFavoritePositionIds(store)).toEqual([1, 4]);
  });

  it('没有 localStorage 时不抛错', () => {
    expect(loadFavoritePositionIds(null)).toEqual([]);
    expect(isFavoritePositionId(1, null)).toBe(false);
    expect(toggleFavoritePositionId(1, null)).toBe(true);
  });
});

describe('applicationTimelineSteps', () => {
  const base = {
    created_at: '2026-11-28T10:00:00+08:00',
    reviewed_at: null,
    admin_note: '',
    interview_at: null,
    interview_note: '',
  };

  it('待审核：已提交 → 审核中 → 等结果', () => {
    const steps = applicationTimelineSteps({ ...base, status: 'pending' });
    expect(steps.map(s => s.key)).toEqual(['submitted', 'reviewing', 'result']);
    expect(steps[1].state).toBe('current');
    expect(steps[2].state).toBe('todo');
  });

  it('已通过且没约面试：已提交 → 审核通过，不加面试节点', () => {
    const steps = applicationTimelineSteps({
      ...base, status: 'approved', reviewed_at: '2026-11-29T09:00:00+08:00',
    });
    expect(steps.map(s => s.key)).toEqual(['submitted', 'reviewing']);
    expect(steps[1].state).toBe('done');
  });

  it('已通过且约了面试：带面试节点与说明', () => {
    const steps = applicationTimelineSteps({
      ...base, status: 'approved', reviewed_at: '2026-11-29T09:00:00+08:00',
      interview_at: '2026-12-01T14:30:00+08:00', interview_note: '带身份证到前台',
    });
    expect(steps.map(s => s.key)).toEqual(['submitted', 'reviewing', 'interview']);
    expect(steps[2].time).toBe('2026-12-01T14:30:00+08:00');
    expect(steps[2].note).toBe('带身份证到前台');
  });

  it('未通过：带驳回原因', () => {
    const steps = applicationTimelineSteps({
      ...base, status: 'rejected', reviewed_at: '2026-11-29T09:00:00+08:00',
      admin_note: '经验与岗位要求不符',
    });
    expect(steps.map(s => s.key)).toEqual(['submitted', 'reviewing']);
    expect(steps[1].state).toBe('bad');
    expect(steps[1].note).toBe('经验与岗位要求不符');
  });
});

describe('departmentColor', () => {
  it('同一部门每次取到同一颜色，不同部门不全相同', () => {
    expect(departmentColor('技术')).toBe(departmentColor('技术'));
    const colors = new Set(['管理层', '人事行政', '财务', '技术', '运营', '后勤'].map(departmentColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});
