import { describe, expect, it } from 'vitest';
import { createCallIslandActivity } from './QianzhiCallIslandActivity';

describe('Qianzhi call island activity', () => {
  it('prioritizes incoming calls and exposes accept/reject actions', () => {
    const activity = createCallIslandActivity({
      phase: 'incoming',
      peerName: '同学 A',
      seconds: 0,
      muted: false,
    });

    expect(activity.id).toBe('qz-call-session');
    expect(activity.priority).toBeGreaterThan(100);
    expect(activity.alert).toBe(true);
    expect(activity.label).toContain('同学 A');
    expect(activity.expanded?.bottom).toBeTruthy();
  });

  it('shows elapsed time and mute state for an active call', () => {
    const activity = createCallIslandActivity({
      phase: 'in-call',
      peerName: '同学 B',
      seconds: 125,
      muted: true,
    });

    expect(activity.alert).toBeUndefined();
    expect(activity.priority).toBeGreaterThan(100);
    expect(activity.label).toContain('同学 B');
    expect(activity.compact?.trailing).toBeTruthy();
    expect(activity.expanded?.bottom).toBeTruthy();
  });
});
