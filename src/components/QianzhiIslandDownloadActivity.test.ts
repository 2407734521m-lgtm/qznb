import { describe, expect, it } from 'vitest';
import { createDownloadIslandActivity } from './QianzhiIslandDownloadActivity';

describe('createDownloadIslandActivity', () => {
  it('shows a measured percentage while downloading', () => {
    const activity = createDownloadIslandActivity({ count: 1, progress: 42, status: 'downloading' });
    expect(activity.id).toBe('qz-download-progress');
    expect(activity.priority).toBe(22);
    expect(activity.label).toBe('正在下载文件');
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
  });
});
