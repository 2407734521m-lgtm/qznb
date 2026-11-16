import { describe, expect, it } from 'vitest';
import { isEndedTrackPush, isMusicTrackFinished, isSameMusicTrack, musicTrackIdentity, resolveMusicEqualizerMode, resolveMusicIslandLabel, shouldCrossfadeMusicTrack, shouldShowMainIsland } from './MusicIsland';
import { hasNewIslandActivity, resolveIslandDockGesture, resolveIslandGestureSource, resolveMusicIslandTapAction, shouldCancelPendingIslandDock, shouldEndTracklessMusicActivity, shouldShowIslandIdleRecall, shouldShowMusicEmptyState } from './QianzhiMusicIslandActivity';
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
  volume: 0.8,
  isMuted: false,
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

  it('notices a volume or mute change, and treats an unreported volume as unknown', () => {
    expect(isSameMusicTrack(track(), track({ volume: 0.5 }))).toBe(false);
    expect(isSameMusicTrack(track(), track({ isMuted: true }))).toBe(false);
    expect(isSameMusicTrack(track({ volume: null }), track({ volume: null }))).toBe(true);
    expect(isSameMusicTrack(track({ volume: null }), track())).toBe(false);
  });
});


describe('musicTrackIdentity', () => {
  it('changes when the song, artist or cover changes, but not on a progress tick', () => {
    const first = musicTrackIdentity(track());
    expect(first).not.toBeNull();
    expect(musicTrackIdentity(track({ currentTime: 13 }))).toBe(first);
    expect(musicTrackIdentity(track({ isPlaying: false }))).toBe(first);
    expect(musicTrackIdentity(track({ title: 'Other' }))).not.toBe(first);
    expect(musicTrackIdentity(track({ artist: 'B' }))).not.toBe(first);
    expect(musicTrackIdentity(track({ coverUrl: null }))).not.toBe(first);
    expect(musicTrackIdentity(null)).toBeNull();
  });
});

describe('shouldCrossfadeMusicTrack', () => {
  const first = musicTrackIdentity(track());
  const second = musicTrackIdentity(track({ title: 'Other' }));

  it('crossfades a new song only when music is the sole activity in compact form', () => {
    expect(shouldCrossfadeMusicTrack(first, second, true, true)).toBe(true);
  });

  it('stays in place on the first song, on a pause, and when the song is unchanged', () => {
    expect(shouldCrossfadeMusicTrack(null, second, true, true)).toBe(false);
    expect(shouldCrossfadeMusicTrack(first, first, true, true)).toBe(false);
    expect(shouldCrossfadeMusicTrack(first, second, true, true)).toBe(true);
    expect(shouldCrossfadeMusicTrack(first, musicTrackIdentity(track({ isPlaying: false })), true, true)).toBe(false);
  });

  it('does not crossfade while expanded or while another activity shares the island', () => {
    expect(shouldCrossfadeMusicTrack(first, second, true, false)).toBe(false);
    expect(shouldCrossfadeMusicTrack(first, second, false, true)).toBe(false);
  });
});

describe('isMusicTrackFinished', () => {
  it('treats the same song paused at its full length as finished', () => {
    expect(isMusicTrackFinished(track(), track({ isPlaying: false, currentTime: 200 }))).toBe(true);
    expect(isMusicTrackFinished(track(), track({ isPlaying: false, currentTime: 199 }))).toBe(true);
  });

  it('does not end the session on a pause mid-track, a resume, or a new song', () => {
    expect(isMusicTrackFinished(track(), track({ isPlaying: false, currentTime: 100 }))).toBe(false);
    expect(isMusicTrackFinished(track(), track({ isPlaying: true, currentTime: 200 }))).toBe(false);
    expect(isMusicTrackFinished(track(), track({ title: 'Other', isPlaying: false, currentTime: 200 }))).toBe(false);
  });

  it('needs a previous track and a known length', () => {
    expect(isMusicTrackFinished(null, track({ isPlaying: false, currentTime: 200 }))).toBe(false);
    expect(isMusicTrackFinished(track({ duration: 0 }), track({ duration: 0, isPlaying: false, currentTime: 0 }))).toBe(false);
  });
});

describe('isEndedTrackPush', () => {
  const ended = musicTrackIdentity(track());

  it('swallows the same song still pushed finished after its grace elapsed', () => {
    expect(isEndedTrackPush(track({ isPlaying: false, currentTime: 200 }), ended)).toBe(true);
  });

  it('lets a live change to the song through', () => {
    expect(isEndedTrackPush(track(), ended)).toBe(false);
    expect(isEndedTrackPush(track({ isPlaying: false, currentTime: 100 }), ended)).toBe(false);
    expect(isEndedTrackPush(track({ title: 'Other', isPlaying: false, currentTime: 200 }), ended)).toBe(false);
    expect(isEndedTrackPush(track({ isPlaying: false, currentTime: 200 }), null)).toBe(false);
  });
});

describe('resolveMusicIslandLabel', () => {
  it('names a live song by its state, and stays neutral with no song', () => {
    expect(resolveMusicIslandLabel(null)).toBe('还没放歌');
    expect(resolveMusicIslandLabel(track())).toBe('正在播放：Hello');
    expect(resolveMusicIslandLabel(track({ isPlaying: false }))).toBe('已暂停：Hello');
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


describe('shouldCancelPendingIslandDock', () => {
  it('cancels a delayed dock when the visible island receives a new gesture', () => {
    expect(shouldCancelPendingIslandDock('island')).toBe(true);
    expect(shouldCancelPendingIslandDock('peek')).toBe(false);
  });
});

describe('resolveMusicIslandTapAction', () => {
  it('expands in place when the island itself is tapped, with or without a track', () => {
    expect(resolveMusicIslandTapAction('idle-recall')).toBe('expand');
  });

  it('opens the music space only from the button inside the expanded empty card', () => {
    expect(resolveMusicIslandTapAction('empty-state-button')).toBe('openMusic');
  });
});

describe('shouldShowMusicEmptyState', () => {
  it('shows the empty card exactly when no track is live', () => {
    expect(shouldShowMusicEmptyState(null)).toBe(true);
    expect(shouldShowMusicEmptyState(track())).toBe(false);
  });
});

describe('shouldEndTracklessMusicActivity', () => {
  it('ends a trackless music activity once the island leaves the expanded view', () => {
    expect(shouldEndTracklessMusicActivity(false, false, ['music-playback'])).toBe(true);
    expect(shouldEndTracklessMusicActivity(false, false, [])).toBe(false);
  });

  it('keeps the empty card while it is expanded, and keeps a playing song untouched', () => {
    expect(shouldEndTracklessMusicActivity(false, true, ['music-playback'])).toBe(false);
    expect(shouldEndTracklessMusicActivity(true, false, ['music-playback'])).toBe(false);
    expect(shouldEndTracklessMusicActivity(true, true, ['music-playback'])).toBe(false);
  });
});

describe('shouldShowIslandIdleRecall', () => {
  it('shows the thin recall edge only when nothing is live', () => {
    expect(shouldShowIslandIdleRecall([], false, false)).toBe(true);
  });

  it('keeps the capsule when an activity, a dock or fullscreen suppression is in play', () => {
    expect(shouldShowIslandIdleRecall(['music-playback'], false, false)).toBe(false);
    expect(shouldShowIslandIdleRecall([], true, false)).toBe(false);
    expect(shouldShowIslandIdleRecall([], false, true)).toBe(false);
  });
});
