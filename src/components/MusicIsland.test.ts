import { describe, expect, it } from 'vitest';
import { isSameMusicTrack } from './MusicIsland';

const track = (overrides = {}) => ({
  title: 'Hello',
  artist: 'A',
  coverUrl: 'https://example.com/y.jpg',
  isPlaying: true,
  currentTime: 12,
  duration: 200,
  canPrevious: true,
  canNext: true,
  canToggle: true,
  ...overrides,
});

describe('isSameMusicTrack', () => {
  it('treats identical tracks and two nulls as the same', () => {
    expect(isSameMusicTrack(track(), track())).toBe(true);
    expect(isSameMusicTrack(null, null)).toBe(true);
  });

  it('notices a song, state or second change', () => {
    expect(isSameMusicTrack(track(), track({ title: 'Other' }))).toBe(false);
    expect(isSameMusicTrack(track(), track({ isPlaying: false }))).toBe(false);
    expect(isSameMusicTrack(track(), track({ currentTime: 13 }))).toBe(false);
    expect(isSameMusicTrack(track(), track({ coverUrl: null }))).toBe(false);
    expect(isSameMusicTrack(track(), null)).toBe(false);
    expect(isSameMusicTrack(null, track())).toBe(false);
  });
});
