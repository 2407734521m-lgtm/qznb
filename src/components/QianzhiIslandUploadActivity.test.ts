import { describe, expect, it } from 'vitest';
import { createUploadIslandActivity } from './QianzhiIslandUploadActivity';

describe('Qianzhi upload island activity', () => {
  it('uses one aggregate activity for multiple in-flight uploads', () => {
    const activity = createUploadIslandActivity({
      count: 3,
      progress: 42,
      status: 'uploading',
      label: '正在上传 3 项',
    });

    expect(activity.id).toBe('qz-upload-progress');
    expect(activity.priority).toBeLessThan(55);
    expect(activity.label).toBe('正在上传 3 项');
    expect(activity.expanded?.bottom).toBeTruthy();
  });

  it('supports indeterminate uploads and terminal states', () => {
    const unknownProgress = createUploadIslandActivity({
      count: 1,
      progress: null,
      status: 'uploading',
    });
    const completed = createUploadIslandActivity({
      count: 0,
      progress: 100,
      status: 'completed',
    });

    expect(unknownProgress.label).toBe('正在上传文件');
    expect(completed.label).toBe('上传完成');
  });
});
