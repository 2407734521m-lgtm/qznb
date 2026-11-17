import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

type Props = {
  url: string;
  messageId?: number;
  autoPlay?: boolean;
  onEnded?: (messageId: number) => void;
};

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const value = Math.floor(seconds);
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}

export default function ChatAudioWaveform({ url, messageId, autoPlay = false, onEnded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let alive = true;
    const player = WaveSurfer.create({
      container,
      height: 34,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      normalize: true,
      waveColor: '#aab7c9',
      progressColor: '#477fc5',
      cursorWidth: 0,
      hideScrollbar: true,
      autoScroll: false,
      interact: true,
      dragToSeek: true,
      url,
    });
    playerRef.current = player;
    player.on('ready', value => {
      if (!alive) return;
      setDuration(value);
      setFailed(false);
      if (autoPlay) void player.play().catch(() => setPlaying(false));
    });
    player.on('timeupdate', value => { if (alive) setCurrentTime(value); });
    player.on('play', () => {
      if (!alive) return;
      setPlaying(true);
      window.dispatchEvent(new CustomEvent('qz-chat-media-play', { detail: { id: messageId ?? null } }));
    });
    player.on('pause', () => { if (alive) setPlaying(false); });
    player.on('finish', () => {
      if (!alive) return;
      setPlaying(false);
      if (messageId !== undefined) onEnded?.(messageId);
    });
    player.on('error', () => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [url, messageId, autoPlay, onEnded]);

  useEffect(() => {
    const pauseOther = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number | null }>).detail;
      if (detail?.id !== messageId) playerRef.current?.pause();
    };
    window.addEventListener('qz-chat-media-play', pauseOther);
    return () => window.removeEventListener('qz-chat-media-play', pauseOther);
  }, [messageId]);

  const toggle = () => {
    const player = playerRef.current;
    if (!player || failed) return;
    void player.playPause().catch(() => setFailed(true));
  };

  return (
    <div className="im-audio-card" data-message-id={messageId}>
      <button type="button" className="im-audio-symbol" onClick={toggle}
        aria-label={playing ? '暂停语音' : '播放语音'} disabled={failed}>
        {failed ? '!' : playing ? 'Ⅱ' : '▶'}
      </button>
      <div className="im-audio-main">
        <div className="im-waveform" ref={containerRef} aria-label="语音波形，可点击定位" />
        <div className="im-audio-meta">
          <span>{failed ? '音频暂时无法播放' : playing ? clock(currentTime) : clock(duration || currentTime)}</span>
          <span>{duration ? clock(duration) : '语音消息'}</span>
        </div>
      </div>
    </div>
  );
}
