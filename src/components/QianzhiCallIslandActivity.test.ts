import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import type { CallPhase } from '../lib/call';
import type { CallIslandActivityInput } from './QianzhiCallIslandActivity';
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
      onExpand: () => {},
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
      onExpand: () => {},
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
      onExpand: () => {},
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


describe('call island phase transitions', () => {
  const noop = () => {};
  const makeInput = (phase: CallPhase): CallIslandActivityInput => ({
    phase,
    peerName: '测试好友',
    startedAt: phase === 'in-call' ? 1_000 : null,
    muted: false,
    speakerEnabled: false,
    onAccept: noop,
    onReject: noop,
    onCancel: noop,
    onHangUp: noop,
    onToggleMute: noop,
    onToggleSpeaker: noop,
    onRestore: noop,
    onExpand: noop,
  });

  it('keeps the call layout mounted while animating only changing status labels', () => {
    const incoming = createCallIslandActivity(makeInput('incoming'));
    const active = createCallIslandActivity(makeInput('in-call'));

    expect(active.id).toBe(incoming.id);
    expect((incoming.compact?.leading as ReactElement).key).toBeNull();
    expect((incoming.compact?.trailing as ReactElement).key).toBeNull();
    expect((active.minimal as ReactElement).key).toBeNull();
    expect((incoming.expanded?.center as ReactElement).key).toBeNull();
    expect((active.expanded?.bottom as ReactElement).key).toBeNull();
  });

  it('does not remount the entire action row when mute or speaker state changes', () => {
    const active = createCallIslandActivity(makeInput('in-call'));
    const muted = createCallIslandActivity({ ...makeInput('in-call'), muted: true });
    const speaker = createCallIslandActivity({ ...makeInput('in-call'), speakerEnabled: true });

    expect((active.expanded?.bottom as ReactElement).key).toBeNull();
    expect((muted.expanded?.bottom as ReactElement).key).toBeNull();
    expect((speaker.expanded?.bottom as ReactElement).key).toBeNull();
  });

  it('expands the island in place on tap instead of restoring the fullscreen call', () => {
    const onExpand = () => {};
    const onRestore = () => {};
    const onHangUp = () => {};
    const activity = createCallIslandActivity({ ...makeInput('in-call'), onExpand, onRestore, onHangUp });

    expect(activity.onPress).toBe(onExpand);
    const actionRow = activity.expanded?.bottom as ReactElement<{ children: ReactElement<{ children: ReactElement<{ label: string; onAction: () => void }>[] }> }>;
    const actions = actionRow.props.children.props.children;
    expect(actions.map(action => action.props.label)).toEqual(['返回通话', '静音', '扬声器', '挂断']);
    expect(actions[0].props.onAction).toBe(onRestore);
    expect(actions[3].props.onAction).toBe(onHangUp);
  });

  it('keys actions by what they do, so a double-tap cannot fire the next phase’s button', () => {
    const actionKeys = (phase: CallPhase): (string | null)[] => {
      const activity = createCallIslandActivity(makeInput(phase));
      const actionRow = activity.expanded?.bottom as ReactElement<{ children: ReactElement<{ children?: ReactElement<{ label: string }>[] }> }>;
      const child = actionRow.props.children;
      // incoming / connecting / in-call wrap the actions in a fragment;
      // outgoing renders its single button directly.
      const group = child.props.children ?? child;
      const actions = Array.isArray(group) ? group : [group];
      return actions.map(action => action.key);
    };

    // "接听" and "取消连接" sit in the same slot across the incoming ->
    // connecting change: with different keys React unmounts the old button
    // instead of reusing its node for the new action.
    expect(actionKeys('incoming')).toEqual(['reject', 'accept']);
    expect(actionKeys('connecting')).toEqual(['restore', 'cancel-connection']);
    expect(actionKeys('outgoing')).toEqual(['cancel']);
    expect(actionKeys('in-call')).toEqual(['restore', 'mute', 'speaker', 'hangup']);
    // The same action keeps its key across phases, so it is not remounted.
    expect(actionKeys('connecting')[0]).toBe(actionKeys('in-call')[0]);
  });
});
