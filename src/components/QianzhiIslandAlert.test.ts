import { describe, expect, it, vi } from 'vitest';
import { combineIslandAlertBatch, type IslandAlertInput } from './QianzhiIslandAlert';

const makeAlert = (overrides: Partial<IslandAlertInput> = {}): IslandAlertInput => ({
  id: 'notice-1',
  kind: 'interaction',
  title: '有人评论了你的动态',
  body: '这段内容不应出现在合并预览中',
  priority: 28,
  alert: false,
  onPress: vi.fn(),
  ...overrides,
});

describe('combineIslandAlertBatch', () => {
  it('returns null for an empty queue and preserves a single alert unchanged', () => {
    expect(combineIslandAlertBatch([])).toBeNull();
    const single = makeAlert();
    expect(combineIslandAlertBatch([single])).toBe(single);
  });

  it('combines a burst and keeps the highest-priority destination', () => {
    const low = makeAlert({ id: 'like-1', kind: 'interaction', priority: 28 });
    const friendAction = vi.fn();
    const high = makeAlert({
      id: 'friend-2',
      kind: 'friend',
      priority: 46,
      title: '收到新的好友申请',
      alert: true,
      onPress: friendAction,
    });

    const batch = combineIslandAlertBatch([low, high]);

    expect(batch).toMatchObject({
      kind: 'friend',
      title: '收到 2 条新提醒',
      priority: 46,
      alert: true,
      durationMs: 7500,
    });
    expect(batch?.id).toContain('batch-like-1-friend-2-2');
    expect(batch?.body).toContain('互动');
    expect(batch?.body).toContain('好友申请');
    expect(batch?.body).not.toContain('这段内容');
    batch?.onPress?.();
    expect(friendAction).toHaveBeenCalledOnce();
  });

  it('keeps ordinary interaction batches compact instead of forcing expansion', () => {
    const batch = combineIslandAlertBatch([
      makeAlert({ id: 'like-a' }),
      makeAlert({ id: 'comment-b', title: '收到新评论' }),
    ]);
    expect(batch?.kind).toBe('interaction');
    expect(batch?.alert).toBe(false);
    expect(batch?.priority).toBe(28);
  });
});
