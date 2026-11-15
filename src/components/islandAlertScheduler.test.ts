import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IslandAlertInput } from './QianzhiIslandAlert';
import { createIslandAlertScheduler } from './islandAlertScheduler';

const alert = (id: string, priority: number): IslandAlertInput => ({
  id, kind: 'interaction', title: 'title-' + id, priority, alert: true,
});

function setup(canShow: () => boolean = () => true) {
  const shown: IslandAlertInput[] = [];
  const ended: string[] = [];
  const scheduler = createIslandAlertScheduler({
    show: input => {
      shown.push(input);
      let done = false;
      return { end: () => { if (done) return; done = true; ended.push(input.id); input.onEnd?.(); } };
    },
    canShow,
  });
  return { shown, ended, scheduler };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createIslandAlertScheduler', () => {
  it('merges a burst into one alert', () => {
    const { shown, scheduler } = setup();
    scheduler.enqueue(alert('a', 28));
    scheduler.enqueue(alert('b', 28));
    vi.advanceTimersByTime(420);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('收到 2 条新提醒');
  });

  it('keeps a lower-priority alert until the current one ends, then shows it', () => {
    const { shown, scheduler } = setup();
    scheduler.enqueue(alert('msg', 55));
    vi.advanceTimersByTime(420);
    scheduler.enqueue(alert('like', 28));
    vi.advanceTimersByTime(420);
    expect(shown.map(item => item.id)).toEqual(['msg']);
    shown[0].onEnd?.();
    vi.advanceTimersByTime(450);
    expect(shown.map(item => item.id)).toEqual(['msg', 'like']);
  });

  it('folds an equal or higher priority alert into the one on screen with a running count', () => {
    const { shown, ended, scheduler } = setup();
    scheduler.enqueue(alert('a', 28));
    vi.advanceTimersByTime(420);
    scheduler.enqueue(alert('b', 28));
    vi.advanceTimersByTime(420);
    scheduler.enqueue({ ...alert('c', 46), kind: 'friend' });
    vi.advanceTimersByTime(420);
    expect(ended).toHaveLength(2);
    expect(shown[2]).toMatchObject({ title: '收到 3 条新提醒', priority: 46, kind: 'friend' });
  });

  it('dismiss closes the alert and drops what was waiting', () => {
    const { shown, ended, scheduler } = setup();
    scheduler.enqueue(alert('msg', 55));
    vi.advanceTimersByTime(420);
    scheduler.enqueue(alert('like', 28));
    vi.advanceTimersByTime(420);
    scheduler.dismiss();
    vi.advanceTimersByTime(3000);
    expect(ended.length).toBe(1);
    expect(shown).toHaveLength(1);
  });

  it('shows nothing while quiet hours or a hidden page forbid it, and stops after dispose', () => {
    let allowed = false;
    const { shown, ended, scheduler } = setup(() => allowed);
    scheduler.enqueue(alert('a', 28));
    vi.advanceTimersByTime(1000);
    expect(shown).toHaveLength(0);
    allowed = true;
    scheduler.enqueue(alert('b', 28));
    vi.advanceTimersByTime(420);
    expect(shown).toHaveLength(1);
    scheduler.dispose();
    expect(ended).toEqual(['b']);
    scheduler.enqueue(alert('c', 28));
    vi.advanceTimersByTime(1000);
    expect(shown).toHaveLength(1);
  });
});
