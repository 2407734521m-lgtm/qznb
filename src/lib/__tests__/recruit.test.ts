import { describe, expect, it } from 'vitest';
import {
  applicationTimelineSteps,
  departmentColor,
  formatCloseDeadline,
  formatDateTime,
  formatHolderNames,
  isFavoritePositionId,
  isPositionFull,
  isRecruitClosed,
  loadFavoritePositionIds,
  parseHolderNames,
  parseSalaryRange,
  positionOccupied,
  positionRemaining,
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

describe('isRecruitClosed', () => {
  const now = new Date('2026-11-28T14:00:00+08:00');
  it('没设 / 非法值算未关闭', () => {
    expect(isRecruitClosed(null, now)).toBe(false);
    expect(isRecruitClosed(undefined, now)).toBe(false);
    expect(isRecruitClosed('not-a-date', now)).toBe(false);
  });
  it('未来的关闭时间未关闭，过去的已关闭，到点整算关闭', () => {
    expect(isRecruitClosed('2026-12-01T14:30:00+08:00', now)).toBe(false);
    expect(isRecruitClosed('2026-11-28T13:59:59+08:00', now)).toBe(true);
    expect(isRecruitClosed('2026-11-28T14:00:00+08:00', now)).toBe(true);
  });
});

describe('formatCloseDeadline', () => {
  it('按北京时间输出“月日 时:分”', () => {
    // 06:30Z 就是北京时间 14:30（写死期望值，不随本机时区变）。
    expect(formatCloseDeadline('2026-12-01T06:30:00Z')).toBe('12月1日 14:30');
    expect(formatCloseDeadline('2026-11-30T16:30:00Z')).toBe('12月1日 00:30');
  });
  it('空值与非法值返回破折号', () => {
    expect(formatCloseDeadline(null)).toBe('—');
    expect(formatCloseDeadline('not-a-date')).toBe('—');
  });
});

describe('parseHolderNames / formatHolderNames', () => {
  it('顿号、逗号、分号、空格分隔都能切开，去空去重保序', () => {
    expect(parseHolderNames('王瑞、李柯')).toEqual(['王瑞', '李柯']);
    expect(parseHolderNames('王瑞,李柯；严浩溢 王瑞')).toEqual(['王瑞', '李柯', '严浩溢']);
    expect(parseHolderNames('  王瑞  、、 李柯 ')).toEqual(['王瑞', '李柯']);
    expect(parseHolderNames('')).toEqual([]);
    expect(parseHolderNames('、，； ')).toEqual([]);
  });
  it('数组转回顿号隔开的文本', () => {
    expect(formatHolderNames(['王瑞', '李柯'])).toBe('王瑞、李柯');
    expect(formatHolderNames([])).toBe('');
    expect(formatHolderNames(null)).toBe('');
    expect(formatHolderNames(undefined)).toBe('');
  });
});

describe('名额计算（已通过申请数 + 任职人数）', () => {
  it('已占 = 通过数 + 任职人数，剩余最小为 0', () => {
    expect(positionOccupied(0, ['王瑞'])).toBe(1);
    expect(positionOccupied(1, ['李柯', '严浩溢'])).toBe(3);
    expect(positionOccupied(0, [])).toBe(0);
    expect(positionOccupied(0, null)).toBe(0);
    expect(positionRemaining(1, 0, ['王瑞'])).toBe(0);
    expect(positionRemaining(2, 0, ['李柯', '严浩溢'])).toBe(0);
    expect(positionRemaining(2, 0, ['李柯'])).toBe(1);
    expect(positionRemaining(2, 1, ['李柯'])).toBe(0);
    expect(positionRemaining(2, 0, [])).toBe(2);
  });
  it('已占 >= 名额算满', () => {
    expect(isPositionFull(1, 0, ['王瑞'])).toBe(true);
    expect(isPositionFull(2, 0, ['李柯', '严浩溢'])).toBe(true);
    expect(isPositionFull(2, 0, ['李柯'])).toBe(false);
    expect(isPositionFull(2, 1, ['李柯'])).toBe(true);
    expect(isPositionFull(1, 1, [])).toBe(true);
    expect(isPositionFull(1, 0, [])).toBe(false);
  });
});

describe('parseSalaryRange', () => {
  it('空白与“面议”算面议', () => {
    expect(parseSalaryRange('')).toEqual({ min: null, max: null });
    expect(parseSalaryRange('   ')).toEqual({ min: null, max: null });
    expect(parseSalaryRange('面议')).toEqual({ min: null, max: null });
  });
  it('区间支持多种分隔符与“元/月”后缀', () => {
    expect(parseSalaryRange('6000–9000')).toEqual({ min: 6000, max: 9000 });
    expect(parseSalaryRange('6000-9000')).toEqual({ min: 6000, max: 9000 });
    expect(parseSalaryRange('6000~9000')).toEqual({ min: 6000, max: 9000 });
    expect(parseSalaryRange('6000–9000元/月')).toEqual({ min: 6000, max: 9000 });
    expect(parseSalaryRange(' 6000 – 9000 ')).toEqual({ min: 6000, max: 9000 });
  });
  it('单个数字算下限', () => {
    expect(parseSalaryRange('5000')).toEqual({ min: 5000, max: null });
  });
  it('下限大于上限、纯文字、三段区间都算格式不对', () => {
    expect(parseSalaryRange('9000–6000')).toBeNull();
    expect(parseSalaryRange('abc')).toBeNull();
    expect(parseSalaryRange('6000–9000–12000')).toBeNull();
  });
});
