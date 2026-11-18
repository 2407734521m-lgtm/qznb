import { useEffect, useRef, useState } from 'react';
import { formatVoiceDuration } from '../lib/chatVoiceRecording';

type Props = {
  blob: Blob;
  durationMs: number;
  sending: boolean;
  onSend: () => void;
  onDiscard: () => void;
};

export default function ChatVoiceDraftPreview({
  blob,
  durationMs,
  sending,
  onSend,
  onDiscard,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(Math.max(0, durationMs / 1000));

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    setCurrentTime(0);
    setMediaDuration(Math.max(0, durationMs / 1000));
    setPlaying(false);
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob, durationMs]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !url || sending) return;
    if (audio.paused) {
      try {
        if (audio.ended) audio.currentTime = 0;
        await audio.play();
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  const duration = mediaDuration > 0 ? mediaDuration : Math.max(0, durationMs / 1000);
  const progress = duration > 0 ? Math.min(100, Math.max(0, currentTime / duration * 100)) : 0;

  return (
    <div className="im-voice-draft-preview" role="group" aria-label="发送前试听语音">
      <button
        type="button"
        className="im-voice-draft-play"
        onClick={() => void togglePlayback()}
        disabled={!url || sending}
        aria-label={playing ? '暂停试听' : '试听录音'}
      >
        {playing ? 'Ⅱ' : '▶'}
      </button>
      <div className="im-voice-draft-main">
        <div className="im-voice-draft-title">语音预览</div>
        <input
          className="im-voice-draft-seek"
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={Math.min(currentTime, duration)}
          onChange={event => seek(Number(event.currentTarget.value))}
          style={{
            background: 'linear-gradient(90deg, #3478d4 ' + progress + '%, #dce4ef ' + progress + '%)',
          }}
          aria-label="试听进度"
          disabled={!url || sending || duration <= 0}
        />
        <div className="im-voice-draft-times">
          <span>{formatVoiceDuration(currentTime)}</span>
          <span>{formatVoiceDuration(durationMs / 1000)}</span>
        </div>
      </div>
      <div className="im-voice-draft-actions">
        <button type="button" className="im-voice-draft-discard" onClick={onDiscard} disabled={sending}>
          删除
        </button>
        <button type="button" className="im-voice-draft-send" onClick={onSend} disabled={!url || sending}>
          {sending ? '发送中…' : '发送'}
        </button>
      </div>
      <audio
        ref={audioRef}
        src={url || undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={event => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setMediaDuration(value);
        }}
        className="im-voice-draft-audio"
      />
    </div>
  );
}
