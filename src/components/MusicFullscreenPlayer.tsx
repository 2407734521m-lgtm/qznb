import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

type MusicTrack = {
  title: string;
  artist: string;
  coverUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  canPrevious: boolean;
  canNext: boolean;
  canToggle: boolean;
};

type Props = {
  track: MusicTrack;
  connected: boolean;
  sendCommand: (command: 'toggle' | 'previous' | 'next' | 'seek', value?: number) => void;
  onMinimize: () => void;
  onOpenMusic: () => void;
};

const formatTime = (value: number): string => {
  const safe = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

function ControlIcon({ name }: { name: 'back10' | 'previous' | 'play' | 'pause' | 'next' | 'forward10' | 'minimize' }) {
  const common = {
    viewBox: '0 0 64 64',
    width: '100%',
    height: '100%',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  if (name === 'play') return <svg {...common}><path d="M22 12v40l31-20z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'pause') return <svg {...common}><rect x="17" y="12" width="11" height="40" rx="5.5" fill="currentColor" stroke="none" /><rect x="36" y="12" width="11" height="40" rx="5.5" fill="currentColor" stroke="none" /></svg>;
  if (name === 'previous') return <svg {...common}><path d="M8 12v40" /><path d="M54 12 28 32l26 20z" fill="currentColor" stroke="none" /><path d="M31 12 5 32l26 20z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'next') return <svg {...common}><path d="M56 12v40" /><path d="M10 12 36 32 10 52z" fill="currentColor" stroke="none" /><path d="M33 12 59 32 33 52z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'minimize') return <svg {...common}><path d="m17 27 15 15 15-15" /></svg>;

  const backwards = name === 'back10';
  return (
    <svg {...common}>
      {backwards
        ? <path d="M17 19A22 22 0 1 1 10 36M8 9v13h13" />
        : <path d="M47 19a22 22 0 1 0 7 17M56 9v13H43" />}
      <text x="32" y="37" textAnchor="middle" dominantBaseline="middle" fill="currentColor" stroke="none" fontSize="16" fontWeight="750">10</text>
    </svg>
  );
}

export default function MusicFullscreenPlayer({ track, connected, sendCommand, onMinimize, onOpenMusic }: Props) {
  const [smoothTime, setSmoothTime] = useState(track.currentTime);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const seekDraftRef = useRef<number | null>(null);
  const shownTimeRef = useRef(track.currentTime);
  const anchorRef = useRef({ time: track.currentTime, at: Date.now() });
  const duration = Math.max(0, track.duration);

  useEffect(() => {
    anchorRef.current = { time: track.currentTime, at: Date.now() };
    setSmoothTime(track.currentTime);
  }, [track.currentTime, track.title, track.artist]);

  useEffect(() => {
    if (!track.isPlaying || seekDraft !== null || duration <= 0) return;
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - anchorRef.current.at) / 1000;
      setSmoothTime(Math.min(duration, anchorRef.current.time + elapsed));
    }, 80);
    return () => window.clearInterval(timer);
  }, [track.isPlaying, seekDraft, duration]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMinimize();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onMinimize]);

  const shownTime = seekDraft ?? smoothTime;
  shownTimeRef.current = shownTime;
  const progress = duration > 0 ? Math.min(100, Math.max(0, (shownTime / duration) * 100)) : 0;

  const seekBy = (seconds: number) => {
    if (!connected || duration <= 0) return;
    const next = Math.min(duration, Math.max(0, shownTimeRef.current + seconds));
    anchorRef.current = { time: next, at: Date.now() };
    setSmoothTime(next);
    sendCommand('seek', next);
  };

  const updateSeekDraft = (value: number) => {
    seekDraftRef.current = value;
    setSeekDraft(value);
  };

  const commitSeek = () => {
    const value = seekDraftRef.current;
    if (value === null) return;
    seekDraftRef.current = null;
    setSeekDraft(null);
    anchorRef.current = { time: value, at: Date.now() };
    setSmoothTime(value);
    sendCommand('seek', value);
  };

  const cancelSeek = () => {
    seekDraftRef.current = null;
    setSeekDraft(null);
  };

  const closeFromBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onMinimize();
  };

  return (
    <motion.div
      className="qz-music-fullscreen-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onClick={closeFromBackdrop}
    >
      <motion.section
        className="qz-music-fullscreen-panel"
        role="dialog"
        aria-modal="true"
        aria-label="音乐播放器"
        initial={{ opacity: 0, y: 28, scale: 0.965 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.975 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.9 }}
      >
        <button type="button" className="qz-music-fullscreen-minimize" onClick={onMinimize} aria-label="最小化播放器">
          <ControlIcon name="minimize" />
        </button>

        <div className="qz-music-fullscreen-header">
          {track.coverUrl
            ? <img className="qz-music-fullscreen-art" src={track.coverUrl} alt="" />
            : <div className="qz-music-fullscreen-art qz-music-fullscreen-art-fallback" aria-hidden="true">♫</div>}
          <div className="qz-music-fullscreen-meta">
            <h2 key={track.title}>{track.title}</h2>
            <p key={track.artist}>{track.artist || '未知歌手'}</p>
            <span>{track.isPlaying ? '正在播放' : '已暂停'}</span>
          </div>
          <div className={'qz-music-fullscreen-wave' + (track.isPlaying ? ' is-playing' : '')} aria-label={track.isPlaying ? '音乐频谱' : '音乐已暂停'}>
            <i /><i /><i /><i /><i /><i /><i />
          </div>
        </div>

        <div className="qz-music-fullscreen-progress">
          <span>{formatTime(shownTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={1}
            value={Math.min(duration || 0, shownTime)}
            style={{ '--qz-fullscreen-progress': progress + '%' } as React.CSSProperties}
            onChange={event => updateSeekDraft(Number(event.target.value))}
            onPointerUp={commitSeek}
            onPointerCancel={cancelSeek}
            onKeyUp={commitSeek}
            onBlur={commitSeek}
            aria-label="歌曲播放进度"
            aria-valuetext={`${formatTime(shownTime)} / ${formatTime(duration)}`}
            disabled={!connected || duration <= 0}
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="qz-music-fullscreen-controls">
          <button type="button" onClick={() => seekBy(-10)} disabled={!connected || duration <= 0} aria-label="后退 10 秒">
            <ControlIcon name="back10" />
          </button>
          <button type="button" onClick={() => sendCommand('previous')} disabled={!connected || !track.canPrevious} aria-label="上一首">
            <ControlIcon name="previous" />
          </button>
          <button type="button" className="qz-music-fullscreen-play" onClick={() => sendCommand('toggle')} disabled={!connected || !track.canToggle} aria-label={track.isPlaying ? '暂停' : '播放'}>
            <ControlIcon name={track.isPlaying ? 'pause' : 'play'} />
          </button>
          <button type="button" onClick={() => sendCommand('next')} disabled={!connected || !track.canNext} aria-label="下一首">
            <ControlIcon name="next" />
          </button>
          <button type="button" onClick={() => seekBy(10)} disabled={!connected || duration <= 0} aria-label="前进 10 秒">
            <ControlIcon name="forward10" />
          </button>
        </div>

        <div className="qz-music-fullscreen-footer">
          <span>{connected ? '已连接音乐空间' : '正在重新连接音乐空间'}</span>
          <button type="button" onClick={onOpenMusic}>打开音乐空间</button>
        </div>
      </motion.section>
    </motion.div>
  );
}
