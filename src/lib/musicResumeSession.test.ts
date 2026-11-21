import { beforeEach, describe, expect, it } from 'vitest';
import {
  MUSIC_RESUME_KEY,
  MUSIC_RESUME_MAX_AGE_MS,
  clearMusicResumeSession,
  readMusicResumeSession,
  saveMusicResumeSession,
  sessionFromTrack,
  shouldResumeSession,
  shouldSaveResumeSession,
  type MusicResumeSession,
  type MusicResumeTrack,
} from './musicResumeSession';

// vitest runs in node: stub the browser storage this module uses.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
} as Storage;

beforeEach(() => {
  store.clear();
});

const NOW = 1794835200000;
const track = (overrides: Partial<MusicResumeTrack> = {}): MusicResumeTrack => ({
  title: '岷江夜曲',
  artist: 'Internet Archive contributor',
  coverUrl: 'https://example.com/cover.jpg',
  isPlaying: true,
  currentTime: 17,
  duration: 214,
  ...overrides,
});
const session = (overrides: Partial<MusicResumeSession> = {}): MusicResumeSession => ({
  ...sessionFromTrack(track(), NOW),
  ...overrides,
});

describe('music resume session storage', () => {
  it('round-trips a session through storage', () => {
    saveMusicResumeSession(session());
    expect(readMusicResumeSession(NOW)).toEqual(session());
  });

  it('returns null when nothing was ever saved', () => {
    expect(readMusicResumeSession(NOW)).toBeNull();
  });

  it('returns null for corrupt stored JSON', () => {
    store.set(MUSIC_RESUME_KEY, '{not json');
    expect(readMusicResumeSession(NOW)).toBeNull();
  });

  it('returns null for a session without a title', () => {
    store.set(MUSIC_RESUME_KEY, JSON.stringify({ ...session(), title: '  ' }));
    expect(readMusicResumeSession(NOW)).toBeNull();
  });

  it('drops a session older than the max age', () => {
    saveMusicResumeSession(session({ at: NOW - MUSIC_RESUME_MAX_AGE_MS - 1000 }));
    expect(readMusicResumeSession(NOW)).toBeNull();
  });

  it('keeps a session just inside the max age', () => {
    saveMusicResumeSession(session({ at: NOW - MUSIC_RESUME_MAX_AGE_MS + 1000 }));
    expect(readMusicResumeSession(NOW)?.title).toBe('岷江夜曲');
  });

  it('clears the stored session', () => {
    saveMusicResumeSession(session());
    clearMusicResumeSession();
    expect(readMusicResumeSession(NOW)).toBeNull();
  });

  it('floors the position and caps an overlong title when building from a track', () => {
    const built = sessionFromTrack(track({ title: 'x'.repeat(300), currentTime: 17.9 }), NOW);
    expect(built.title).toHaveLength(180);
    expect(built.position).toBe(17);
  });
});

describe('shouldResumeSession', () => {
  it('resumes the same song mid-track', () => {
    expect(shouldResumeSession(session(), track({ isPlaying: false, currentTime: 0 }), NOW)).toBe(true);
  });

  it('refuses a different song', () => {
    expect(shouldResumeSession(session(), track({ title: '星座色光' }), NOW)).toBe(false);
  });

  it('refuses when nothing was saved', () => {
    expect(shouldResumeSession(null, track(), NOW)).toBe(false);
  });

  it('refuses a session whose position is at the very start', () => {
    expect(shouldResumeSession(session({ position: 1 }), track(), NOW)).toBe(false);
  });

  it('refuses a session whose position is at the very end', () => {
    expect(shouldResumeSession(session({ position: 213 }), track(), NOW)).toBe(false);
    expect(shouldResumeSession(session({ position: 212 }), track(), NOW)).toBe(false);
  });

  it('refuses when the live track has no known length', () => {
    expect(shouldResumeSession(session(), track({ duration: 0 }), NOW)).toBe(false);
  });

  it('refuses a stale session even when the song matches', () => {
    expect(shouldResumeSession(session({ at: NOW - MUSIC_RESUME_MAX_AGE_MS - 1 }), track(), NOW)).toBe(false);
  });

  it('ignores a changed cover when matching the song', () => {
    expect(shouldResumeSession(session(), track({ coverUrl: null }), NOW)).toBe(true);
  });
});

describe('shouldSaveResumeSession', () => {
  it('saves the first snapshot', () => {
    expect(shouldSaveResumeSession(null, track())).toBe(true);
  });

  it('skips a push that changes nothing worth saving', () => {
    expect(shouldSaveResumeSession(session(), track())).toBe(false);
    expect(shouldSaveResumeSession(session(), track({ currentTime: 19 }))).toBe(false);
  });

  it('saves after a step of progress', () => {
    expect(shouldSaveResumeSession(session(), track({ currentTime: 22 }))).toBe(true);
  });

  it('saves a play/pause flip at once', () => {
    expect(shouldSaveResumeSession(session(), track({ isPlaying: false, currentTime: 17 }))).toBe(true);
  });

  it('saves a new song at once', () => {
    expect(shouldSaveResumeSession(session(), track({ title: '星座色光', currentTime: 0 }))).toBe(true);
  });

  it('saves a backwards seek of a step or more', () => {
    expect(shouldSaveResumeSession(session(), track({ currentTime: 5 }))).toBe(true);
  });
});
