import { describe, expect, it } from 'vitest';
import type { Activity } from '../lib/island';
import { resolveIslandActivityCategory, resolveIslandTaskAccessibleLabel, resolveIslandTaskProgress, resolveIslandTaskStatusLabel, shouldRenderIslandTaskDrawer } from './QianzhiIslandTaskDrawer';

describe('resolveIslandActivityCategory', () => {
  it('recognizes the existing call, music, notification and transfer activities', () => {
    expect(resolveIslandActivityCategory('qz-call-session')).toBe('通话');
    expect(resolveIslandActivityCategory('music-playback')).toBe('音乐');
    expect(resolveIslandActivityCategory('qz-alert-message-1')).toBe('通知');
    expect(resolveIslandActivityCategory('qz-voice-recording')).toBe('录音');
    expect(resolveIslandActivityCategory('qz-island-timer')).toBe('网页活动');
    expect(resolveIslandActivityCategory('qz-upload-progress')).toBe('文件传输');
  });

  it('recognizes download activities and falls back for other web activities', () => {
    expect(resolveIslandActivityCategory('qz-download-progress')).toBe('文件传输');
    expect(resolveIslandActivityCategory('custom-page-activity')).toBe('网页活动');
  });

  it('classifies ids without depending on letter case', () => {
    expect(resolveIslandActivityCategory('QZ-CALL-SESSION')).toBe('通话');
  });
});


describe('activity task status presentation', () => {
  it('clamps measured progress and preserves indeterminate progress', () => {
    expect(resolveIslandTaskProgress(42.4)).toBe(42);
    expect(resolveIslandTaskProgress(140)).toBe(100);
    expect(resolveIslandTaskProgress(-10)).toBe(0);
    expect(resolveIslandTaskProgress(null)).toBeNull();
    expect(resolveIslandTaskProgress(undefined)).toBeNull();
  });

  it('uses clear status labels for running, completed and failed activities', () => {
    expect(resolveIslandTaskStatusLabel('running')).toBe('进行中');
    expect(resolveIslandTaskStatusLabel('done')).toBe('已完成');
    expect(resolveIslandTaskStatusLabel('error')).toBe('失败');
  });
});

describe('resolveIslandTaskAccessibleLabel', () => {
  const activity = (overrides: Partial<Activity>): Activity => ({
    id: 'qz-upload-progress',
    label: '上传照片',
    priority: 10,
    ...overrides,
  } as Activity);

  it('carries status, detail and progress into the accessible name', () => {
    expect(resolveIslandTaskAccessibleLabel(activity({
      task: { status: 'running', progress: 42.4, detail: '正在上传 3 张照片' },
    }))).toBe('切换到：上传照片，文件传输 · 进行中，正在上传 3 张照片，进度 42%');
  });

  it('names completed and failed tasks without a progress percentage', () => {
    expect(resolveIslandTaskAccessibleLabel(activity({
      task: { status: 'done', progress: 100 },
    }))).toBe('切换到：上传照片，文件传输 · 已完成');
    expect(resolveIslandTaskAccessibleLabel(activity({
      task: { status: 'error', detail: '网络中断' },
    }))).toBe('切换到：上传照片，文件传输 · 失败，网络中断');
  });

  it('falls back to a running label when there is no task state', () => {
    expect(resolveIslandTaskAccessibleLabel(activity({}))).toBe('切换到：上传照片，文件传输 · 正在运行');
  });
});


describe('activity switcher visibility', () => {
  it('stays available while the island is compact or expanded', () => {
    // Expansion is intentionally not a hiding condition: the user can open the
    // activity list beside the expanded capsule and choose another running item.
    expect(shouldRenderIslandTaskDrawer(false, false)).toBe(true);
  });

  it('hides while docked or while the keyboard is occupying the screen', () => {
    expect(shouldRenderIslandTaskDrawer(true, false)).toBe(false);
    expect(shouldRenderIslandTaskDrawer(false, true)).toBe(false);
  });
});
