import { describe, expect, it, vi } from 'vitest';
import { createRoutePreloader, ROUTE_PRELOAD_ENTRIES } from './routePreload';
import { routeSkeletonKind } from '../components/fx/Skeleton';

describe('route preload matching', () => {
  const { match } = createRoutePreloader(ROUTE_PRELOAD_ENTRIES);

  it('matches the primary Dock tabs and inbox/chat by exact path or prefix', () => {
    expect(match('/friends')?.key).toBe('friends');
    expect(match('/messages')?.key).toBe('friends');
    expect(match('/chat/abc123')?.key).toBe('chat');
    expect(match('/home')?.key).toBe('home');
    expect(match('/explore')?.key).toBe('explore');
    expect(match('/feed')?.key).toBe('discover');
    expect(match('/me')?.key).toBe('me');
  });

  it('does not match sub-pages that live in a different chunk', () => {
    expect(match('/me/settings')).toBeUndefined();
    expect(match('/me/account')).toBeUndefined();
    expect(match('/love-wall')).toBeUndefined();
    expect(match('/')).toBeUndefined();
    expect(match('/chat')).toBeUndefined();
  });
});

describe('route preload warming', () => {
  it('loads each chunk only once', async () => {
    const load = vi.fn(async () => ({}));
    const { preload, warmed } = createRoutePreloader([
      { pattern: /^\/friends/, key: 'friends', load },
    ]);
    expect(preload('/friends')).toBe(true);
    expect(preload('/friends')).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    expect(warmed.has('friends')).toBe(true);
  });

  it('returns false and never calls a loader for unknown paths', () => {
    const load = vi.fn(async () => ({}));
    const { preload } = createRoutePreloader([
      { pattern: /^\/friends/, key: 'friends', load },
    ]);
    expect(preload('/love-wall')).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('retries after a failed warm instead of marking the chunk done', async () => {
    const load = vi.fn(async () => {
      throw new Error('chunk gone');
    });
    const { preload, warmed } = createRoutePreloader([
      { pattern: /^\/friends/, key: 'friends', load },
    ]);
    expect(preload('/friends')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warmed.has('friends')).toBe(false);
    expect(preload('/friends')).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('routeSkeletonKind', () => {
  it('picks the inbox skeleton for the message center', () => {
    expect(routeSkeletonKind('/friends')).toBe('inbox');
    expect(routeSkeletonKind('/messages')).toBe('inbox');
  });

  it('picks the chat skeleton for a conversation', () => {
    expect(routeSkeletonKind('/chat/abc123')).toBe('chat');
  });

  it('falls back to the generic page skeleton for everything else', () => {
    expect(routeSkeletonKind('/home')).toBe('page');
    expect(routeSkeletonKind('/explore')).toBe('page');
    expect(routeSkeletonKind('/me')).toBe('page');
    expect(routeSkeletonKind('/love-wall')).toBe('page');
  });
});
