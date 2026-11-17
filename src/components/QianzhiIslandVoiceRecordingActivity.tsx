import { useEffect, useState } from 'react';
import type { ActivityOptions } from '../lib/island';
import './QianzhiIslandVoiceRecordingActivity.css';

export function formatVoiceRecordingTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
}

function RecordingClock({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return <time className="qz-voice-island-clock" aria-label={'录音时长 ' + formatVoiceRecordingTime(elapsed)}>{formatVoiceRecordingTime(elapsed)}</time>;
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
    </svg>
  );
}

/** A restrained activity indicator; the moving bars signal recording, not measured audio amplitude. */
function RecordingWaveform() {
  return (
    <span className="qz-voice-island-waveform" aria-hidden="true">
      <i /><i /><i /><i /><i /><i /><i /><i /><i />
    </span>
  );
}

export function createVoiceRecordingIslandActivity(input: {
  startedAt: number;
  onPress: () => void;
}): ActivityOptions {
  return {
    id: 'qz-voice-recording',
    label: '正在录制语音',
    priority: 68,
    alert: false,
    onPress: input.onPress,
    compact: {
      leading: (
        <span className="qz-voice-island-compact">
          <span className="qz-voice-island-mic"><MicrophoneIcon /></span>
          <span>录音中</span>
        </span>
      ),
      trailing: <RecordingClock startedAt={input.startedAt} />,
    },
    minimal: <span className="qz-voice-island-minimal"><MicrophoneIcon /></span>,
    expanded: {
      leading: (
        <span className="qz-voice-island-expanded-head">
          <span className="qz-voice-island-mic qz-voice-island-mic-large"><MicrophoneIcon /></span>
          <span className="qz-voice-island-expanded-copy">
            <strong>正在录制语音</strong>
            <small>私聊语音消息</small>
          </span>
        </span>
      ),
      trailing: <RecordingClock startedAt={input.startedAt} />,
      center: <RecordingWaveform />,
      bottom: <span className="qz-voice-island-hint">返回聊天可结束并发送语音</span>,
    },
  };
}
