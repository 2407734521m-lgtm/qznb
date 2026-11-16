import { describe, expect, it } from 'vitest';
import { createNavigationIslandActivity, routeActivityLabel } from './QianzhiIslandNavigationActivity';

describe('routeActivityLabel', () => {
  it('returns concise labels for known site sections', () => {
    expect(routeActivityLabel('/chat/42')).toBe('私聊');
    expect(routeActivityLabel('/friends')).toBe('好友');
    expect(routeActivityLabel('/me/settings')).toBe('个人中心');
    expect(routeActivityLabel('/music')).toBe('音乐空间');
    expect(routeActivityLabel('/explore')).toBe('发现');
  });

  it('uses a neutral label for unknown routes without exposing their path', () => {
    expect(routeActivityLabel('/internal/sensitive-id')).toBe('页面');
  });
});

describe('createNavigationIslandActivity', () => {
  it('keeps the capsule text-only while showing an indeterminate loading state', () => {
    const activity = createNavigationIslandActivity('私聊');
    expect(activity.id).toBe('qz-route-navigation');
    expect(activity.priority).toBe(14);
    expect(activity.label).toBe('正在打开私聊');
    expect(activity.compact?.leading).toBeTruthy();
    expect(activity.compact?.trailing).toBeUndefined();
    expect(activity.expanded?.bottom).toBeTruthy();
    expect(activity.expanded?.center).toBeTruthy();
  });

  it('retains the success state until the detached check has been shown', () => {
    const activity = createNavigationIslandActivity('私聊', 'success');
    expect(activity.label).toBe('已打开私聊');
    expect(activity.compact?.trailing).toBeUndefined();
    expect(activity.minimal).toBeTruthy();
    expect(activity.expanded?.bottom).toBeNull();
  });
});
