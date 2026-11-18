import { describe, expect, it, vi } from 'vitest';
import {
  createIslandTimerActivity,
  formatIslandTimerRemaining,
  getIslandTimerRemainingMs,
  type IslandTimerSession,
} from './QianzhiIslandTimerActivity';

const session = (overrides: Partial<IslandTimerSession> = {}): IslandTimerSession => ({
  status: 'running',
  startedAt: 1_000,
  durationMs: 25 * 60_000,
  endsAt: 25 * 60_000 + 1_000,
  remainingMs: 25 * 60_000,
  ...overrides,
});

describe('formatIslandTimerRemaining', () => {
  it('formats seconds, minutes and hours without going negative', () => {
    expect(formatIslandTimerRemaining(0)).toBe('00:00');
    expect(formatIslandTimerRemaining(1)).toBe('00:01');
    expect(formatIslandTimerRemaining(61_001)).toBe('01:02');
    expect(formatIslandTimerRemaining(3_661_000)).toBe('01:01:01');
    expect(formatIslandTimerRemaining(-1000)).toBe('00:00');
  });

  it('rounds a partial second up so a live timer never flashes 00:00 early', () => {
    expect(formatIslandTimerRemaining(1)).toBe('00:01');
    expect(formatIslandTimerRemaining(999)).toBe('00:01');
  });
});

describe('getIslandTimerRemainingMs', () => {
  it('uses the absolute end time for running timers', () => {
    expect(getIslandTimerRemainingMs(session(), 10_000)).toBe(1_491_000);
    expect(getIslandTimerRemainingMs(session(), 2_000_000)).toBe(0);
  });

  it('keeps paused time stable and returns zero when done', () => {
    expect(getIslandTimerRemainingMs(session({ status: 'paused', endsAt: null, remainingMs: 9000 }), 50_000)).toBe(9000);
    expect(getIslandTimerRemainingMs(session({ status: 'done', endsAt: null }), 50_000)).toBe(0);
  });
});

describe('createIslandTimerActivity', () => {
  it('creates a running countdown activity with pause, resume and stop actions', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onStop = vi.fn();
    const activity = createIslandTimerActivity({
      session: session(),
      onPress: vi.fn(),
      onPause,
      onResume,
      onStop,
      onComplete: vi.fn(),
    });
    expect(activity).toMatchObject({
      id: 'qz-island-timer',
      label: '倒计时 · 倒计时中',
      priority: 36,
      task: { status: 'running', detail: '倒计时 · 25 分钟' },
    });
    expect(activity.compact?.trailing).toBeTruthy();
    expect(activity.expanded?.center).toBeTruthy();
    expect(activity.expanded?.bottom).toBeTruthy();
  });

  it('marks a completed countdown as done', () => {
    const activity = createIslandTimerActivity({
      session: session({ status: 'done', endsAt: null, remainingMs: 0 }),
      onPress: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onComplete: vi.fn(),
    });
    expect(activity).toMatchObject({
      label: '倒计时 · 已完成',
      alert: true,
      task: { status: 'done', detail: '计时已结束' },
    });
  });
});
