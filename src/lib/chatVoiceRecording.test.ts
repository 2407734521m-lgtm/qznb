import { describe, expect, it } from 'vitest';
import {
  formatVoiceDuration,
  getVoiceCancelProgress,
  MAX_VOICE_RECORDING_SECONDS,
  resolveVoiceRecordingFormat,
  VOICE_CANCEL_DISTANCE_PX,
} from './chatVoiceRecording';

describe('voice recording gesture and duration helpers', () => {
  it('keeps the existing 60 second recording limit', () => {
    expect(MAX_VOICE_RECORDING_SECONDS).toBe(60);
  });

  it('tracks left-swipe cancellation progress and clamps at the threshold', () => {
    expect(getVoiceCancelProgress(300, 300)).toBe(0);
    expect(getVoiceCancelProgress(300, 300 - VOICE_CANCEL_DISTANCE_PX / 2)).toBe(0.5);
    expect(getVoiceCancelProgress(300, 100)).toBe(1);
    expect(getVoiceCancelProgress(300, 330)).toBe(0);
  });

  it('ignores non-finite pointer coordinates', () => {
    expect(getVoiceCancelProgress(Number.NaN, 10)).toBe(0);
    expect(getVoiceCancelProgress(10, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('formats recording and playback time consistently', () => {
    expect(formatVoiceDuration(0)).toBe('0:00');
    expect(formatVoiceDuration(9.8)).toBe('0:09');
    expect(formatVoiceDuration(60)).toBe('1:00');
    expect(formatVoiceDuration(125)).toBe('2:05');
    expect(formatVoiceDuration(-1)).toBe('0:00');
  });
});

describe('voice recording file format', () => {
  it('preserves supported browser recording formats', () => {
    expect(resolveVoiceRecordingFormat('audio/mp4;codecs=mp4a.40.2')).toEqual({
      mime: 'audio/mp4', extension: 'm4a',
    });
    expect(resolveVoiceRecordingFormat('audio/ogg;codecs=opus')).toEqual({
      mime: 'audio/ogg', extension: 'ogg',
    });
    expect(resolveVoiceRecordingFormat('audio/aac')).toEqual({
      mime: 'audio/aac', extension: 'aac',
    });
    expect(resolveVoiceRecordingFormat('audio/mpeg')).toEqual({
      mime: 'audio/mpeg', extension: 'mp3',
    });
  });

  it('uses WebM as the safe fallback for unknown or empty recorder types', () => {
    expect(resolveVoiceRecordingFormat('')).toEqual({
      mime: 'audio/webm', extension: 'webm',
    });
  });
});
