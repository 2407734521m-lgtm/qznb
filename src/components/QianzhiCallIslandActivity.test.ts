import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { createCallIslandActivity, resolveCallIslandTargetRect } from './QianzhiCallIslandActivity';

describe('Qianzhi call island activity', () => {
  it('prioritizes incoming calls and exposes accept/reject actions', () => {
    const activity = createCallIslandActivity({
      phase: 'incoming',
      peerName: '同学 A',
      startedAt: null,
      muted: false,
      speakerEnabled: false,
      onAccept: () => {},
      onReject: () => {},
      onCancel: () => {},
      onHangUp: () => {},
      onToggleMute: () => {},
      onToggleSpeaker: () => {},
      onRestore: () => {},
    });

    expect(activity.id).toBe('qz-call-session');
    expect(activity.priority).toBeGreaterThan(100);
    expect(activity.alert).toBe(true);
    expect(activity.label).toContain('同学 A');
    expect(isValidElement(activity.compact?.leading)).toBe(true);
    expect((activity.compact?.leading as ReactElement<{ className: string }>).props.className).toContain('is-ringing');
    expect(isValidElement(activity.expanded?.bottom)).toBe(true);
    const actionRow = activity.expanded?.bottom as ReactElement<{ children: ReactElement<{ children: ReactElement<{ label: string }>[] }> }>;
    const actionGroup = actionRow.props.children;
    expect(actionGroup.props.children.map(action => action.props.label)).toEqual(['拒绝', '接听']);
  });

  it('shows elapsed time and mute state for an active call', () => {
    const activity = createCallIslandActivity({
      phase: 'in-call',
      peerName: '同学 B',
      startedAt: Date.now() - 125_000,
      muted: true,
      speakerEnabled: false,
      onAccept: () => {},
      onReject: () => {},
      onCancel: () => {},
      onHangUp: () => {},
      onToggleMute: () => {},
      onToggleSpeaker: () => {},
      onRestore: () => {},
    });

    expect(activity.alert).toBe(false);
    expect(activity.priority).toBeGreaterThan(100);
    expect(activity.label).toContain('同学 B');
    expect(activity.compact?.trailing).toBeTruthy();
    expect(isValidElement(activity.expanded?.bottom)).toBe(true);
    const actionRow = activity.expanded?.bottom as ReactElement<{ children: ReactElement<{ children: ReactElement<{ label: string }>[] }> }>;
    const actionGroup = actionRow.props.children;
    expect(actionGroup.props.children.map(action => action.props.label)).toEqual(['返回通话', '取消静音', '扬声器', '挂断']);
  });
  it('offers cancellation while the call is still connecting', () => {
    const activity = createCallIslandActivity({
      phase: 'connecting',
      peerName: '同学 C',
      startedAt: 0,
      muted: false,
      speakerEnabled: false,
      onAccept: () => {},
      onReject: () => {},
      onCancel: () => {},
      onHangUp: () => {},
      onToggleMute: () => {},
      onToggleSpeaker: () => {},
      onRestore: () => {},
    });
    const actionRow = activity.expanded?.bottom as ReactElement<{ children: ReactElement<{ children: ReactElement<{ label: string }>[] }> }>;
    const actionFragment = actionRow.props.children;
    expect(isValidElement(actionFragment)).toBe(true);
    const actions = (actionFragment as ReactElement<{ children: ReactElement<{ label: string }>[] }>).props.children;
    expect(actions.map(action => action.props.label)).toEqual(['返回通话', '取消连接']);
  });
});


describe('resolveCallIslandTargetRect', () => {
  const base = {
    presentation: 'compact',
    docked: true,
    pillRect: { left: 112, top: -42, width: 166, height: 31.5 },
    viewportWidth: 390,
    anchorTop: 18,
    shapeTop: 12.5,
    shapeHeight: 31.5,
    configuredWidth: 104,
    offsetX: 0,
    offsetY: -10,
  };

  it('uses the saved on-screen Y position when the island DOM is docked off-screen', () => {
    expect(resolveCallIslandTargetRect(base)).toEqual({
      left: 112,
      top: 20.5,
      width: 166,
      height: 31.5,
    });
  });

  it('uses the live pill rect while the island is already visible', () => {
    expect(resolveCallIslandTargetRect({ ...base, docked: false, pillRect: { ...base.pillRect, top: 20 } })).toEqual({
      left: 112,
      top: 20,
      width: 166,
      height: 31.5,
    });
  });

  it('uses the configured capsule geometry when the island is expanded', () => {
    expect(resolveCallIslandTargetRect({ ...base, presentation: 'expanded' })).toEqual({
      left: 143,
      top: 20.5,
      width: 104,
      height: 31.5,
    });
  });
});
