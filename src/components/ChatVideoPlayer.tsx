import { useEffect, useRef, useState } from 'react';
import { isChatAutoplayBlocked } from '../lib/chatPlayback';

type Props = {
  url: string;
  posterUrl?: string | null;
  messageId?: number;
  autoPlay?: boolean;
  onEnded?: (messageId: number) => void;
  onAutoplayBlocked?: (messageId: number) => void;
};

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const value = Math.floor(seconds);
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}

export default function ChatVideoPlayer({ url, posterUrl, messageId, autoPlay = false, onEnded, onAutoplayBlocked }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onAutoplayBlockedRef = useRef(onAutoplayBlocked);
  onAutoplayBlockedRef.current = onAutoplayBlocked;
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasFrame, setHasFrame] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setHasFrame(false);
    setFailed(false);
  }, [url, posterUrl]);

  useEffect(() => {
    if (!autoPlay) return;
    const video = videoRef.current;
    if (video) void video.play().catch(error => {
      setPlaying(false);
      if (messageId !== undefined && isChatAutoplayBlocked(error)) {
        onAutoplayBlockedRef.current?.(messageId);
      }
    });
  }, [autoPlay, url, messageId]);

  useEffect(() => {
    const pauseOther = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number | null }>).detail;
      if (detail?.id === messageId) return;
      videoRef.current?.pause();
    };
    window.addEventListener('qz-chat-media-play', pauseOther);
    return () => window.removeEventListener('qz-chat-media-play', pauseOther);
  }, [messageId]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video || failed) return;
    if (video.paused) void video.play().catch(() => setFailed(true));
    else video.pause();
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(value)) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  const enterFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      void video.requestFullscreen().catch(() => undefined);
      return;
    }
    const legacyVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    legacyVideo.webkitEnterFullscreen?.();
  };

  return (
    <div className={'im-video-player' + (playing ? ' is-playing' : '')}
      data-message-id={messageId}
      data-player="custom"
      data-playback-state={failed ? 'failed' : playing ? 'playing' : 'paused'}>
      {!posterUrl && !hasFrame && (
        <div className="im-video-placeholder" aria-hidden="true">
          <span className="im-video-placeholder-icon">▶</span>
          <span>视频消息</span>
        </div>
      )}
      <video
        ref={videoRef}
        className="im-video"
        style={{ opacity: posterUrl || hasFrame ? 1 : 0 }}
        src={url}
        poster={posterUrl || undefined}
        playsInline
        preload="metadata"
        onClick={toggle}
        onLoadedMetadata={event => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onLoadedData={() => setHasFrame(true)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setPlaying(true);
          window.dispatchEvent(new CustomEvent('qz-chat-media-play', { detail: { id: messageId ?? null } }));
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (messageId !== undefined) onEnded?.(messageId);
        }}
        onError={() => setFailed(true)}
        aria-label="视频消息播放"
      />
      {!playing && !failed && (
        <button type="button" className="im-video-big-play" onClick={toggle} aria-label="播放视频">
          <span aria-hidden="true">▶</span>
        </button>
      )}
      {failed && <div className="im-video-error" role="status">视频暂时无法播放</div>}
      <div className="im-video-controls">
        <button type="button" className="im-video-play-toggle" onClick={toggle}
          aria-label={playing ? '暂停视频' : '播放视频'} disabled={failed}>
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <span className="im-video-time">{clock(currentTime)} / {clock(duration)}</span>
        <input
          type="range"
          className="im-video-seek"
          min={0}
          max={Math.max(duration, 1)}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={event => seek(Number(event.currentTarget.value))}
          aria-label="视频播放进度"
          disabled={!duration || failed}
        />
        <button type="button" className="im-video-fullscreen" onClick={enterFullscreen}
          aria-label="全屏播放" disabled={failed}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
