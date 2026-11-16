import { describe, expect, it } from 'vitest';
import { resolveIslandActivityCategory, resolveIslandTaskProgress, resolveIslandTaskStatusLabel } from './QianzhiIslandTaskDrawer';

describe('resolveIslandActivityCategory', () => {
  it('recognizes the existing call, music, notification and transfer activities', () => {
    expect(resolveIslandActivityCategory('qz-call-session')).toBe('通话');
    expect(resolveIslandActivityCategory('music-playback')).toBe('音乐');
    expect(resolveIslandActivityCategory('qz-alert-message-1')).toBe('通知');
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
