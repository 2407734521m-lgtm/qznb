import { describe, expect, it, vi } from 'vitest';
import { formatVoiceRecordingTime, createVoiceRecordingIslandActivity } from './QianzhiIslandVoiceRecordingActivity';

describe('formatVoiceRecordingTime', () => {
  it('formats elapsed recording time as minutes and seconds', () => {
    expect(formatVoiceRecordingTime(0)).toBe('00:00');
    expect(formatVoiceRecordingTime(9)).toBe('00:09');
    expect(formatVoiceRecordingTime(65.9)).toBe('01:05');
    expect(formatVoiceRecordingTime(3600)).toBe('60:00');
  });

  it('clamps invalid or negative input to zero', () => {
    expect(formatVoiceRecordingTime(-3)).toBe('00:00');
    expect(formatVoiceRecordingTime(Number.NaN)).toBe('00:00');
    expect(formatVoiceRecordingTime(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});

describe('createVoiceRecordingIslandActivity', () => {
  it('creates a quiet, tappable activity with a high-priority recording status', () => {
    const onPress = vi.fn();
    const activity = createVoiceRecordingIslandActivity({ startedAt: 1234, onPress });
    expect(activity).toMatchObject({
      id: 'qz-voice-recording',
      label: '正在录制语音',
      priority: 68,
      alert: false,
      onPress,
    });
    expect(activity.compact?.trailing).toBeTruthy();
    expect(activity.expanded?.center).toBeTruthy();
  });
});
