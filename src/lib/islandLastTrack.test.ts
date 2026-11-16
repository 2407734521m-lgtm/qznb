import { beforeEach, describe, expect, it } from 'vitest';
import { ISLAND_TRACK_EVENT, readIslandLastTrack, saveIslandLastTrack } from './islandLastTrack';

// vitest runs in node: stub the browser globals this module uses.
const store = new Map<string, string>();
const listeners = new Map<string, Array<(event: { type: string; detail?: unknown }) => void>>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
} as Storage;
class FakeCustomEvent {
  readonly type: string;
  readonly detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
}
(globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = FakeCustomEvent as unknown as typeof CustomEvent;
(globalThis as unknown as { window: Window }).window = {
  dispatchEvent: (event: { type: string; detail?: unknown }) => {
    listeners.get(event.type)?.forEach(fn => fn(event));
    return true;
  },
  addEventListener: (type: string, fn: (event: { type: string; detail?: unknown }) => void) => {
    const list = listeners.get(type) ?? [];
    list.push(fn);
    listeners.set(type, list);
  },
  removeEventListener: (type: string, fn: (event: { type: string; detail?: unknown }) => void) => {
    listeners.set(type, (listeners.get(type) ?? []).filter(item => item !== fn));
  },
} as unknown as Window;

beforeEach(() => {
  store.clear();
  listeners.clear();
});

describe('island last track', () => {
  it('round-trips the last track through storage', () => {
    saveIslandLastTrack({ title: '流沙', artist: '陶喆' });
    expect(readIslandLastTrack()).toEqual({ title: '流沙', artist: '陶喆' });
  });

  it('returns null when nothing was ever saved', () => {
    expect(readIslandLastTrack()).toBeNull();
  });

  it('returns null for corrupt stored JSON', () => {
    store.set('qznb_island_last_track_v1', '{not json');
    expect(readIslandLastTrack()).toBeNull();
  });

  it('notifies listeners with the track detail', () => {
    const seen: unknown[] = [];
    window.addEventListener(ISLAND_TRACK_EVENT, (event: Event) => {
      seen.push((event as unknown as { detail: unknown }).detail);
    });
    saveIslandLastTrack({ title: 'Au bout du monde', artist: 'Cyborgjeff' });
    expect(seen).toEqual([{ title: 'Au bout du monde', artist: 'Cyborgjeff' }]);
  });

  it('caps an overlong title at 180 characters', () => {
    saveIslandLastTrack({ title: 'x'.repeat(300), artist: '' });
    expect(readIslandLastTrack()?.title).toHaveLength(180);
  });
});
