import { describe, expect, it } from 'vitest';
import {
  NavigationActivityScheduler,
  NAVIGATION_ACTIVITY_END_DEBOUNCE_MS,
  NAVIGATION_ACTIVITY_MIN_VISIBLE_MS,
  NAVIGATION_ACTIVITY_SHOW_DELAY_MS,
} from './navigation-activity-scheduler';

function createFakeTimers() {
  let currentTime = 0;
  let nextId = 1;
  const jobs = new Map<number, { at: number; callback: () => void }>();

  return {
    now: () => currentTime,
    setTimeout(callback: () => void, delayMs: number) {
      const id = nextId++;
      jobs.set(id, { at: currentTime + delayMs, callback });
      return id;
    },
    clearTimeout(id: number) {
      jobs.delete(id);
    },
    advance(ms: number) {
      const target = currentTime + ms;
      while (true) {
        const next = [...jobs.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next || next[1].at > target) break;
        currentTime = next[1].at;
        jobs.delete(next[0]);
        next[1].callback();
      }
      currentTime = target;
    },
  };
}

describe('NavigationActivityScheduler', () => {
  it('does not flash for a route that resolves before the show delay', () => {
    const timers = createFakeTimers();
    const scheduler = new NavigationActivityScheduler(timers);
    const events: string[] = [];
    const sink = {
      show: (label: string) => events.push('show:' + label),
      end: () => events.push('end'),
    };

    scheduler.enter(sink, '首页');
    timers.advance(NAVIGATION_ACTIVITY_SHOW_DELAY_MS - 1);
    scheduler.leave();
    timers.advance(2_000);

    expect(events).toEqual([]);
  });

  it('marks a visible activity complete before its dismissal window', () => {
    const timers = createFakeTimers();
    const scheduler = new NavigationActivityScheduler(timers);
    const events: string[] = [];
    const sink = {
      show: (label: string) => events.push('show:' + label),
      complete: () => events.push('complete'),
      end: () => events.push('end'),
    };

    scheduler.enter(sink, '发现');
    timers.advance(NAVIGATION_ACTIVITY_SHOW_DELAY_MS);
    scheduler.leave();

    expect(events).toEqual(['show:发现', 'complete']);
    timers.advance(NAVIGATION_ACTIVITY_MIN_VISIBLE_MS - 1);
    expect(events).toEqual(['show:发现', 'complete']);
    timers.advance(1);
    expect(events).toEqual(['show:发现', 'complete', 'end']);
  });

  it('returns to loading when another route starts during the success window', () => {
    const timers = createFakeTimers();
    const scheduler = new NavigationActivityScheduler(timers);
    const events: string[] = [];
    const sink = {
      show: (label: string) => events.push('show:' + label),
      complete: () => events.push('complete'),
      end: () => events.push('end'),
    };

    scheduler.enter(sink, '首页');
    timers.advance(NAVIGATION_ACTIVITY_SHOW_DELAY_MS);
    scheduler.leave();
    timers.advance(200);
    scheduler.enter(sink, '私聊');

    expect(events).toEqual(['show:首页', 'complete', 'show:私聊']);
    scheduler.leave();
    timers.advance(NAVIGATION_ACTIVITY_MIN_VISIBLE_MS - 201);
    expect(events).toEqual(['show:首页', 'complete', 'show:私聊', 'complete']);
    timers.advance(1);
    expect(events).toEqual(['show:首页', 'complete', 'show:私聊', 'complete', 'end']);
  });

  it('keeps a shown activity visible for at least 1.5 seconds', () => {
    const timers = createFakeTimers();
    const scheduler = new NavigationActivityScheduler(timers);
    const events: string[] = [];
    const sink = {
      show: (label: string) => events.push('show:' + label),
      end: () => events.push('end'),
    };

    scheduler.enter(sink, '首页');
    timers.advance(NAVIGATION_ACTIVITY_SHOW_DELAY_MS);
    timers.advance(120);
    scheduler.leave();

    timers.advance(NAVIGATION_ACTIVITY_MIN_VISIBLE_MS - 121);
    expect(events).toEqual(['show:首页']);
    timers.advance(1);
    expect(events).toEqual(['show:首页', 'end']);
  });

  it('merges a nearby route transition and updates the existing activity label', () => {
    const timers = createFakeTimers();
    const scheduler = new NavigationActivityScheduler(timers);
    const events: string[] = [];
    const sink = {
      show: (label: string) => events.push('show:' + label),
      end: () => events.push('end'),
    };

    scheduler.enter(sink, '首页');
    timers.advance(NAVIGATION_ACTIVITY_SHOW_DELAY_MS);
    scheduler.leave();
    timers.advance(200);

    scheduler.enter(sink, '私聊');
    expect(events).toEqual(['show:首页', 'show:私聊']);

    scheduler.leave();
    timers.advance(NAVIGATION_ACTIVITY_MIN_VISIBLE_MS - 201);
    expect(events).toEqual(['show:首页', 'show:私聊']);
    timers.advance(1);
    expect(events).toEqual(['show:首页', 'show:私聊', 'end']);
  });

  it('ends after the quiet window when the route load is already long', () => {
    const timers = createFakeTimers();
    const scheduler = new NavigationActivityScheduler(timers);
    const events: string[] = [];
    const sink = {
      show: (label: string) => events.push('show:' + label),
      end: () => events.push('end'),
    };

    scheduler.enter(sink, '发现');
    timers.advance(NAVIGATION_ACTIVITY_SHOW_DELAY_MS);
    timers.advance(NAVIGATION_ACTIVITY_MIN_VISIBLE_MS);
    scheduler.leave();

    timers.advance(NAVIGATION_ACTIVITY_END_DEBOUNCE_MS - 1);
    expect(events).toEqual(['show:发现']);
    timers.advance(1);
    expect(events).toEqual(['show:发现', 'end']);
  });

  it('updates the latest destination while the show delay is pending', () => {
    const timers = createFakeTimers();
    const scheduler = new NavigationActivityScheduler(timers);
    const events: string[] = [];
    const sink = {
      show: (label: string) => events.push('show:' + label),
      end: () => events.push('end'),
    };

    scheduler.enter(sink, '首页');
    scheduler.update('设置');
    timers.advance(NAVIGATION_ACTIVITY_SHOW_DELAY_MS);

    expect(events).toEqual(['show:设置']);
  });
});
