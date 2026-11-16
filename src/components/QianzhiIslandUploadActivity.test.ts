import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
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
    expect(activity.task).toEqual({ status: 'running', detail: '已完成 42%', progress: 42 });
    expect(activity.expanded?.bottom).toBeTruthy();
  });

  it('keeps the full percentage label, including 100%, in the compact slot', () => {
    const activity = createUploadIslandActivity({ count: 1, progress: 100, status: 'uploading' });
    const trailing = activity.compact?.trailing as ReactElement<{ children: string }>;
    expect(trailing.props.children).toBe('100%');
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
    expect(completed.task?.status).toBe('done');
    const failed = createUploadIslandActivity({ count: 0, progress: null, status: 'failed' });
    expect(failed.task?.status).toBe('error');
  });

  it('keys the compact label on status so the arrival animation replays when it settles', () => {
    const uploading = createUploadIslandActivity({ count: 1, progress: 30, status: 'uploading' });
    const completed = createUploadIslandActivity({ count: 0, progress: 100, status: 'completed' });
    expect((uploading.compact?.leading as ReactElement).key).toBe('uploading');
    expect((completed.compact?.leading as ReactElement).key).toBe('completed');
  });
});
