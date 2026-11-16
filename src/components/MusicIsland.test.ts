import { describe, expect, it } from 'vitest';
import { isSameMusicTrack, resolveMusicEqualizerMode, shouldShowMainIsland } from './MusicIsland';
import { hasNewIslandActivity, resolveIslandDockGesture, resolveIslandGestureSource } from './QianzhiMusicIslandActivity';
import { resolveMetrics } from '../lib/island/config';
import { createQianzhiIslandMetrics, qianzhiIslandMetrics } from '../lib/island/qianzhi-metrics';

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

describe('Qianzhi island geometry profile', () => {
  it('uses a longer, slimmer capsule than the upstream default', () => {
    const metrics = resolveMetrics(qianzhiIslandMetrics);
    expect(metrics.idle.width).toBe(104);
    expect(metrics.idle.height).toBe(31.5);
    expect(metrics.compact.sensorWidth).toBe(104);
    expect(metrics.compact.height).toBe(31.5);
    expect(metrics.minimal.height).toBe(31.5);
  });

  it('resolves custom capsule dimensions from user settings', () => {
    const custom = resolveMetrics(createQianzhiIslandMetrics({ width: 132, height: 38 }));
    expect(custom.idle.width).toBe(132);
    expect(custom.idle.height).toBe(38);
    expect(custom.compact.sensorWidth).toBe(132);
    expect(custom.compact.height).toBe(38);
    expect(custom.minimal.height).toBe(38);
  });

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


describe('hasNewIslandActivity', () => {
  it('detects a newly arrived call, upload or notification', () => {
    expect(hasNewIslandActivity(['music-playback'], ['music-playback', 'qz-call-session'])).toBe(true);
  });

  it('does not restore the island for updates to an existing activity', () => {
    expect(hasNewIslandActivity(['qz-call-session'], ['qz-call-session'])).toBe(false);
    expect(hasNewIslandActivity(['qz-call-session', 'qz-upload-progress'], ['qz-call-session'])).toBe(false);
  });
});

describe('resolveIslandGestureSource', () => {
  it('recognizes swipe starts on interactive controls inside the host', () => {
    expect(resolveIslandGestureSource(false, true)).toBe('island');
  });

  it('prioritizes the exposed restore handle and ignores outside taps', () => {
    expect(resolveIslandGestureSource(true, false)).toBe('peek');
    expect(resolveIslandGestureSource(false, false)).toBe(null);
  });
});

describe('resolveIslandDockGesture', () => {
  it('docks on a clear upward swipe from the capsule', () => {
    expect(resolveIslandDockGesture('island', 12, -50)).toBe('dock');
    expect(resolveIslandDockGesture('island', 8, -38)).toBe('dock');
    expect(resolveIslandDockGesture('island', 8, -37)).toBe(null);
  });

  it('restores immediately when the exposed glass edge is tapped', () => {
    expect(resolveIslandDockGesture('peek', 0, 0)).toBe('restore');
    expect(resolveIslandDockGesture('peek', 7, -5)).toBe('restore');
  });

  it('restores on a downward swipe from the exposed edge', () => {
    expect(resolveIslandDockGesture('peek', 8, 24)).toBe('restore');
    expect(resolveIslandDockGesture('peek', 8, 23)).toBe(null);
  });

  it('ignores predominantly horizontal and diagonal movement', () => {
    expect(resolveIslandDockGesture('island', 82, -50)).toBe(null);
    expect(resolveIslandDockGesture('peek', -90, 40)).toBe(null);
    expect(resolveIslandDockGesture('peek', 20, 24)).toBe(null);
  });
});


describe('shouldShowMainIsland', () => {
  it('hides the main island on the immersive music page when only music playback is active', () => {
    expect(shouldShowMainIsland(true, ['music-playback'])).toBe(false);
  });
  it('shows calls and uploads above the immersive music page', () => {
    expect(shouldShowMainIsland(true, ['music-playback', 'qz-call-session'])).toBe(true);
    expect(shouldShowMainIsland(true, ['qz-upload-progress'])).toBe(true);
  });
  it('always shows the main island on normal routes', () => {
    expect(shouldShowMainIsland(false, [])).toBe(true);
  });
});


describe('resolveMusicEqualizerMode', () => {
  it('uses real frequency data when the spectrum contains energy', () => {
    expect(resolveMusicEqualizerMode({
      playing: true,
      available: true,
      mode: 'spectrum',
      level: 0,
      bands: { bass: 0.3, lowMid: 0.2, vocal: 0.1, treble: 0.08 },
    })).toBe('live');
  });

  it('uses measured RMS loudness when frequency bins are not useful', () => {
    expect(resolveMusicEqualizerMode({
      playing: true,
      available: false,
      mode: 'level',
      level: 0.12,
      bands: null,
    })).toBe('live');
  });

  it('keeps bars moving when a playing route exposes no analyser data', () => {
    expect(resolveMusicEqualizerMode({
      playing: true,
      available: false,
      mode: 'fallback',
      level: 0,
      bands: null,
    })).toBe('fallback');
    expect(resolveMusicEqualizerMode({
      playing: true,
      available: false,
      mode: 'idle',
      level: 0,
      bands: null,
    })).toBe('fallback');
  });

  it('keeps near-silent and zero RMS readings live so the bars follow actual volume', () => {
    expect(resolveMusicEqualizerMode({
      playing: true,
      available: false,
      mode: 'level',
      level: 0.004,
      bands: null,
    })).toBe('live');
    expect(resolveMusicEqualizerMode({
      playing: true,
      available: false,
      mode: 'level',
      level: 0,
      bands: null,
    })).toBe('live');
  });

  it('keeps a valid silent FFT frame live instead of switching to decorative motion', () => {
    expect(resolveMusicEqualizerMode({
      playing: true,
      available: true,
      mode: 'spectrum',
      level: 0,
      bands: { bass: 0, lowMid: 0, vocal: 0, treble: 0 },
    })).toBe('live');
  });

  it('stops the equalizer when playback is paused', () => {
    expect(resolveMusicEqualizerMode({
      playing: false,
      available: false,
      mode: 'fallback',
      level: 0,
      bands: null,
    })).toBe('idle');
  });
});
