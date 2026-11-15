import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { createCallIslandActivity } from './QianzhiCallIslandActivity';

describe('Qianzhi call island activity', () => {
  it('prioritizes incoming calls and exposes accept/reject actions', () => {
    const activity = createCallIslandActivity({
      phase: 'incoming',
      peerName: '同学 A',
      seconds: 0,
      muted: false,
      onAccept: () => {},
      onReject: () => {},
      onCancel: () => {},
      onHangUp: () => {},
      onToggleMute: () => {},
    });

    expect(activity.id).toBe('qz-call-session');
    expect(activity.priority).toBeGreaterThan(100);
    expect(activity.alert).toBe(true);
    expect(activity.label).toContain('同学 A');
    expect(isValidElement(activity.expanded?.bottom)).toBe(true);
    const actionRow = activity.expanded?.bottom as ReactElement<{ children: ReactElement<{ children: ReactElement<{ label: string }>[] }> }>;
    const actionGroup = actionRow.props.children;
    expect(actionGroup.props.children.map(action => action.props.label)).toEqual(['拒绝', '接听']);
  });

  it('shows elapsed time and mute state for an active call', () => {
    const activity = createCallIslandActivity({
      phase: 'in-call',
      peerName: '同学 B',
      seconds: 125,
      muted: true,
      onAccept: () => {},
      onReject: () => {},
      onCancel: () => {},
      onHangUp: () => {},
      onToggleMute: () => {},
    });

    expect(activity.alert).toBe(false);
    expect(activity.priority).toBeGreaterThan(100);
    expect(activity.label).toContain('同学 B');
    expect(activity.compact?.trailing).toBeTruthy();
    expect(isValidElement(activity.expanded?.bottom)).toBe(true);
    const actionRow = activity.expanded?.bottom as ReactElement<{ children: ReactElement<{ children: ReactElement<{ label: string }>[] }> }>;
    const actionGroup = actionRow.props.children;
    expect(actionGroup.props.children.map(action => action.props.label)).toEqual(['取消静音', '挂断']);
  });
});
