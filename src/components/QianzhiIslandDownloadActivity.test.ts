import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { createDownloadIslandActivity } from './QianzhiIslandDownloadActivity';

describe('createDownloadIslandActivity', () => {
  it('shows a measured percentage while downloading', () => {
    const activity = createDownloadIslandActivity({ count: 1, progress: 42, status: 'downloading' });
    expect(activity.id).toBe('qz-download-progress');
    expect(activity.priority).toBe(22);
    expect(activity.label).toBe('正在下载文件');
    expect(activity.task).toEqual({ status: 'running', detail: '已下载 42%', progress: 42 });
    expect(activity.expanded?.bottom).toBeTruthy();
  });

  it('keeps unknown content length indeterminate', () => {
    const activity = createDownloadIslandActivity({ count: 1, progress: null, status: 'downloading' });
    expect(activity.label).toBe('正在下载文件');
    expect(activity.expanded?.bottom).toBeTruthy();
  });

  it('clamps progress to the supported range', () => {
    const high = createDownloadIslandActivity({ count: 1, progress: 140, status: 'downloading' });
    const low = createDownloadIslandActivity({ count: 1, progress: -10, status: 'downloading' });
    expect(high.expanded?.bottom).toBeTruthy();
    expect(low.expanded?.bottom).toBeTruthy();
    expect(high.task?.progress).toBe(100);
    expect(low.task?.progress).toBe(0);
  });

  it('keys the compact label on status so the arrival animation replays when it settles', () => {
    const downloading = createDownloadIslandActivity({ count: 1, progress: 30, status: 'downloading' });
    const completed = createDownloadIslandActivity({ count: 0, progress: 100, status: 'completed' });
    expect((downloading.compact?.leading as ReactElement).key).toBe('downloading');
    expect((completed.compact?.leading as ReactElement).key).toBe('completed');
  });
});
