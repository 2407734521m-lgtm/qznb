import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

type Props = {
  url: string;
  messageId?: number;
  autoPlay?: boolean;
  onEnded?: (messageId: number) => void;
};

const autoPlayedMessageIds = new Set<number>();
const MAX_REMEMBERED_AUTO_PLAYS = 200;

function rememberAutoPlay(id: number) {
  autoPlayedMessageIds.add(id);
  if (autoPlayedMessageIds.size > MAX_REMEMBERED_AUTO_PLAYS) {
    const oldest = autoPlayedMessageIds.values().next().value;
    if (oldest !== undefined) autoPlayedMessageIds.delete(oldest);
  }
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const value = Math.floor(seconds);
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}

export default function ChatAudioWaveform({ url, messageId, autoPlay = false, onEnded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const onEndedRef = useRef(onEnded);
  const autoPlayRef = useRef(autoPlay);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  onEndedRef.current = onEnded;
  autoPlayRef.current = autoPlay;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let alive = true;
    let loaded = false;
    setReady(false);
    setFailed(false);
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);

    let player: WaveSurfer;
    try {
      player = WaveSurfer.create({
        container,
        height: 36,
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
    } catch (error) {
      console.warn('[chat-media] waveform initialization failed; using custom fallback controls', error);
      setFailed(true);
      setReady(true);
      return;
    }
    playerRef.current = player;

    const fallbackToCustomControls = () => {
      if (!alive) return;
      setFailed(true);
      setReady(true);
      setPlaying(false);
    };

    const readyTimeout = window.setTimeout(() => {
      if (alive && !loaded) fallbackToCustomControls();
    }, 10000);

    player.on('ready', value => {
      if (!alive) return;
      loaded = true;
      window.clearTimeout(readyTimeout);
      setDuration(value);
      setReady(true);
    });
    player.on('timeupdate', value => { if (alive) setCurrentTime(value); });
    player.on('play', () => {
      if (!alive) return;
      setPlaying(true);
      if (autoPlayRef.current && messageId !== undefined) rememberAutoPlay(messageId);
      window.dispatchEvent(new CustomEvent('qz-chat-media-play', { detail: { id: messageId ?? null } }));
    });
    player.on('pause', () => { if (alive) setPlaying(false); });
    player.on('finish', () => {
      if (!alive) return;
      setPlaying(false);
      if (messageId !== undefined) onEndedRef.current?.(messageId);
    });
    player.on('error', fallbackToCustomControls);

    return () => {
      alive = false;
      window.clearTimeout(readyTimeout);
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [url, messageId]);

  useEffect(() => {
    if (!autoPlay || !ready || (messageId !== undefined && autoPlayedMessageIds.has(messageId))) return;
    if (failed) {
      const audio = audioRef.current;
      if (!audio) return;
      void audio.play().then(() => {
        if (messageId !== undefined) rememberAutoPlay(messageId);
      }).catch(() => setPlaying(false));
      return;
    }
    const player = playerRef.current;
    if (player) void player.play().catch(() => setPlaying(false));
  }, [autoPlay, ready, failed, messageId]);

  useEffect(() => {
    const pauseOther = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number | null }>).detail;
      if (detail?.id === messageId) return;
      playerRef.current?.pause();
      audioRef.current?.pause();
    };
    window.addEventListener('qz-chat-media-play', pauseOther);
    return () => window.removeEventListener('qz-chat-media-play', pauseOther);
  }, [messageId]);

  const toggle = () => {
    if (!ready) return;
    if (failed) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) void audio.play().catch(() => setPlaying(false));
      else audio.pause();
      return;
    }
    const player = playerRef.current;
    if (player) void player.playPause().catch(() => setFailed(true));
  };

  const seekFallback = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const progress = duration > 0 ? Math.min(100, Math.max(0, currentTime / duration * 100)) : 0;

  return (
    <div className="im-audio-card" data-message-id={messageId} data-player="custom">
      <button type="button" className="im-audio-symbol" onClick={toggle}
        aria-label={playing ? '暂停语音' : '播放语音'} disabled={!ready}>
        {!ready ? '…' : playing ? 'Ⅱ' : '▶'}
      </button>
      <div className="im-audio-main">
        {failed ? (
          <>
            <div className="im-audio-fallback-progress">
              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                style={{ background: 'linear-gradient(90deg, #3478d4 ' + progress + '%, #dce4ef ' + progress + '%)' }}
                onChange={event => seekFallback(Number(event.currentTarget.value))}
                aria-label="语音播放进度"
              />
            </div>
            <audio
              ref={audioRef}
              className="im-audio-fallback"
              src={url}
              preload="metadata"
              onPlay={() => {
                setPlaying(true);
                if (autoPlayRef.current && messageId !== undefined) rememberAutoPlay(messageId);
                window.dispatchEvent(new CustomEvent('qz-chat-media-play', { detail: { id: messageId ?? null } }));
              }}
              onPause={() => setPlaying(false)}
              onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={event => {
                if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
                setReady(true);
              }}
              onEnded={() => {
                setPlaying(false);
                if (messageId !== undefined) onEndedRef.current?.(messageId);
              }}
            />
          </>
        ) : (
          <div className="im-waveform" ref={containerRef} aria-label="语音波形，可点击或拖动定位" />
        )}
        <div className="im-audio-meta">
          <span>{clock(currentTime)}</span>
          <span>{duration ? clock(duration) : '语音消息'}</span>
        </div>
      </div>
    </div>
  );
}
