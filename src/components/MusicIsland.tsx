import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import './MusicIsland.css';

const MUSIC_URL = 'https://music.qianzhi.pw';
const MUSIC_ORIGIN = 'https://music.qianzhi.pw';

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

type MusicStateMessage = {
  source: 'qznb-music';
  type: 'STATE';
  version: 1;
  track: MusicTrack | null;
};

type MusicCommand = 'toggle' | 'previous' | 'next' | 'seek';

type MusicSpectrumMessage = {
  source: 'qznb-music';
  type: 'SPECTRUM';
  version: 1;
  playing: boolean;
  available: boolean;
  mode: 'spectrum' | 'level' | 'idle';
  level: number;
  bands: { bass: number; lowMid: number; vocal: number; treble: number } | null;
};

function safeCoverUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return String(Math.floor(seconds / 60)) + ':' + String(seconds % 60).padStart(2, '0');
}

/** A STATE track that changes nothing the island shows: same song, same state, same second. */
export function isSameMusicTrack(a: MusicTrack | null, b: MusicTrack | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.title === b.title
    && a.artist === b.artist
    && a.coverUrl === b.coverUrl
    && a.isPlaying === b.isPlaying
    && a.currentTime === b.currentTime
    && a.duration === b.duration
    && a.canPrevious === b.canPrevious
    && a.canNext === b.canNext
    && a.canToggle === b.canToggle;
}

function MusicIcon({ name, size = 18 }: { name: 'play' | 'pause' | 'previous' | 'next' | 'close' | 'list'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  if (name === 'play') return <svg {...common}><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'pause') return <svg {...common}><path d="M8 5v14M16 5v14" /></svg>;
  if (name === 'previous') return <svg {...common}><path d="M6 5v14M19 5l-11 7 11 7z" /></svg>;
  if (name === 'next') return <svg {...common}><path d="M18 5v14M5 5l11 7-11 7z" /></svg>;
  if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}

function MusicIsland() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const islandWrapRef = useRef<HTMLDivElement | null>(null);
  const isMusicPage = location.pathname === '/music';
  const inQianzhiApp = typeof navigator !== 'undefined' && /QianzhiApp\//i.test(navigator.userAgent);
  const [openedOnce, setOpenedOnce] = useState(false);
  const [frameForeground, setFrameForeground] = useState(isMusicPage);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [track, setTrack] = useState<MusicTrack | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const seekDraftRef = useRef<number | null>(null);
  const lastStateMessageAtRef = useRef(0);
  const lastTrackRef = useRef<MusicTrack | null>(null);
  const leftMusicPageAtRef = useRef(0);
  const shouldMountFrame = openedOnce || isMusicPage;

  useEffect(() => {
    if (isMusicPage) {
      setOpenedOnce(true);
      setFrameForeground(true);
      setExpanded(false);
    } else {
      // Leaving the music page: the white frame is still fading out for ~0.36s, so the
      // island waits ~0.3s before coming in instead of animating over the fading sheet.
      leftMusicPageAtRef.current = Date.now();
    }
  }, [isMusicPage]);

  useEffect(() => {
    if (!shouldMountFrame || !frameLoaded) return;
    const sendHello = () => {
      frameRef.current?.contentWindow?.postMessage({
        source: 'qznb-main',
        type: 'HELLO',
        version: 1,
      }, MUSIC_ORIGIN);
    };
    // Keep a low-frequency handshake alive so an iframe reload or a transient bridge
    // interruption can recover without requiring the user to revisit the music page.
    sendHello();
    const helloTimer = window.setInterval(sendHello, 2500);
    const watchdogTimer = window.setInterval(() => {
      const lastSeen = lastStateMessageAtRef.current;
      if (lastSeen > 0 && Date.now() - lastSeen > 6500) setConnected(false);
    }, 1800);
    return () => {
      window.clearInterval(helloTimer);
      window.clearInterval(watchdogTimer);
    };
  }, [shouldMountFrame, frameLoaded]);

  useEffect(() => {
    if (!shouldMountFrame) return;
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== MUSIC_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as Partial<MusicStateMessage> | Partial<MusicSpectrumMessage> | null;
      if (!message || message.source !== 'qznb-music' || message.version !== 1) return;

      if (message.type === 'SPECTRUM') {
        const spectrum = message as MusicSpectrumMessage;
        const style = islandWrapRef.current?.style;
        if (!style) return;
        const names = ['bass', 'lowMid', 'vocal', 'treble'] as const;
        const levelMultipliers = { bass: 0.68, lowMid: 0.86, vocal: 1, treble: 0.76 } as const;
        const spectrumBands = spectrum.playing && spectrum.mode === 'spectrum' && spectrum.available
          ? spectrum.bands
          : null;
        const rmsLevel = spectrum.playing && spectrum.mode === 'level'
          ? Math.max(0, Math.min(1, Number.isFinite(spectrum.level) ? spectrum.level : 0))
          : 0;
        for (const name of names) {
          const raw = spectrumBands ? spectrumBands[name] : rmsLevel * levelMultipliers[name];
          const energy = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw ?? 0)) : 0;
          // Frequency mode keeps four independent bands; RMS mode moves all bars with overall loudness.
          style.setProperty(`--qz-music-eq-${name}`, String(0.12 + energy * 0.88));
        }
        return;
      }

      if (message.type !== 'STATE') return;
      lastStateMessageAtRef.current = Date.now();
      setConnected(true);
      setShowFallback(false);
      if (!message.track || typeof message.track.title !== 'string') {
        islandWrapRef.current?.style.setProperty('--qz-music-eq-bass', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-lowMid', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-vocal', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-treble', '.12');
        lastTrackRef.current = null;
        setTrack(null);
        return;
      }
      const incoming = message.track as MusicTrack;
      const duration = Number(incoming.duration);
      const currentTime = Number(incoming.currentTime);
      if (!incoming.isPlaying) {
        islandWrapRef.current?.style.setProperty('--qz-music-eq-bass', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-lowMid', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-vocal', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-treble', '.12');
      }
      const nextTrack: MusicTrack = {
        title: incoming.title.slice(0, 180),
        artist: typeof incoming.artist === 'string' ? incoming.artist.slice(0, 180) : '',
        coverUrl: safeCoverUrl(incoming.coverUrl),
        isPlaying: incoming.isPlaying === true,
        // Whole seconds: the bridge pushes every 700ms, but the island only shows whole
        // seconds, so a STATE that changes nothing visible must not re-render the tree.
        currentTime: Number.isFinite(currentTime) ? Math.max(0, Math.floor(currentTime)) : 0,
        duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
        canPrevious: incoming.canPrevious === true,
        canNext: incoming.canNext === true,
        canToggle: incoming.canToggle !== false,
      };
      // The bridge pushes STATE every 700ms; most pushes change nothing the island shows.
      // Skipping those keeps the whole main-site tree from re-rendering on every push.
      if (!isSameMusicTrack(lastTrackRef.current, nextTrack)) {
        lastTrackRef.current = nextTrack;
        setTrack(nextTrack);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [shouldMountFrame]);

  useEffect(() => {
    if (!shouldMountFrame || connected) {
      setShowFallback(false);
      return;
    }
    const timer = window.setTimeout(() => setShowFallback(true), 12000);
    return () => window.clearTimeout(timer);
  }, [shouldMountFrame, connected, frameLoaded]);

  useEffect(() => {
    if (!track) setExpanded(false);
  }, [track]);

  useEffect(() => {
    if (isMusicPage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMusicPage]);

  const sendCommand = (command: MusicCommand, value?: number) => {
    if (!connected) return;
    frameRef.current?.contentWindow?.postMessage({
      source: 'qznb-main',
      type: 'COMMAND',
      version: 1,
      command,
      value,
    }, MUSIC_ORIGIN);
  };

  const commitSeekDraft = () => {
    const value = seekDraftRef.current;
    if (value === null) return;
    seekDraftRef.current = null;
    setSeekDraft(null);
    sendCommand('seek', value);
  };

  const cancelSeekDraft = () => {
    seekDraftRef.current = null;
    setSeekDraft(null);
  };

  // Right after leaving the music page the island waits for the white frame to fade out
  // before coming in; any other mount (playback starting while browsing) comes in at once.
  const islandEnterDelay = Date.now() - leftMusicPageAtRef.current < 1000 ? 0.3 : 0;

  return (
    <>
      {shouldMountFrame && (
        <motion.div
          className="qz-music-frame-host"
          data-open={isMusicPage ? 'true' : 'false'}
          initial={false}
          // Opacity only: sliding and scaling the whole page while it fades made the island
          // ride over a moving white sheet on the way out of the music page.
          animate={{ opacity: isMusicPage ? 1 : 0 }}
          transition={reduceMotion
            ? { duration: 0 }
            : { opacity: { duration: isMusicPage ? 0.34 : 0.36, ease: [0.22, 1, 0.36, 1] } }}
          style={{
            position: 'fixed',
            inset: 0,
            left: 0,
            width: '100vw',
            height: '100dvh',
            // Keep the music surface above the destination route until its fade-out finishes.
            // The iframe stays mounted and transparent/non-interactive while hidden.
            zIndex: frameForeground ? 1000 : 1,
            pointerEvents: isMusicPage ? 'auto' : 'none',
            overflow: 'hidden',
          }}
          onAnimationComplete={() => {
            if (!isMusicPage) setFrameForeground(false);
          }}
          aria-hidden={!isMusicPage}
        >
          <iframe
            ref={frameRef}
            title="堯音乐空间"
            src={MUSIC_URL}
            allow="autoplay; encrypted-media"
            referrerPolicy="strict-origin"
            tabIndex={isMusicPage ? 0 : -1}
            onLoad={() => {
              lastStateMessageAtRef.current = 0;
              setConnected(false);
              setFrameLoaded(true);
            }}
            style={{ display: 'block', width: '100%', height: '100%', border: 0, background: '#fff' }}
          />
          {isMusicPage && (
            <>
              <button
                type="button"
                className="qz-music-return"
                onClick={() => navigate('/explore', { replace: true })}
                aria-label="返回堯网站"
              >
                <span aria-hidden="true">←</span>
                <span>返回堯</span>
              </button>
              {!connected && (
                <div className="qz-music-connect" role="status">
                  <div className="qz-music-connect-title">{showFallback ? '播放器暂未建立连接' : '正在连接音乐空间'}</div>
                  <div className="qz-music-connect-copy">
                    {showFallback ? '音乐页面可能暂不支持嵌入，仍可在独立页面使用。' : '正在建立站内播放器连接…'}
                  </div>
                  {showFallback && (
                    <a href={MUSIC_URL} target="_blank" rel="noopener noreferrer">在新页面打开音乐空间</a>
                  )}
                </div>
              )}
            </>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {track && !isMusicPage && (
          <motion.div
            ref={islandWrapRef}
            className={'qz-music-island-wrap' + (inQianzhiApp ? ' is-qianzhi-app' : '')}
            initial={reduceMotion ? false : { opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.985 }}
            transition={reduceMotion
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.22, ease: [0.16, 1, 0.3, 1], delay: 0.08 + islandEnterDelay },
                  y: { duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.04 + islandEnterDelay },
                  scale: { duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.04 + islandEnterDelay },
                } }
          >
            <LayoutGroup id="qz-music-island">
              <AnimatePresence mode="sync" initial={false}>
              {expanded ? (
                <motion.section
                  key="expanded"
                  className="qz-music-island qz-music-island-expanded"
                  layoutId="qz-music-island-shell"
                  initial={reduceMotion ? false : { opacity: 0, y: -7, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.99 }}
                  // One clock for the whole morph: the layout spring and the content fade ran
                  // on different durations before, so the shell and its content moved out of
                  // step while the glass blurred throughout.
                  transition={reduceMotion
                    ? { duration: 0 }
                    : {
                        layout: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                        opacity: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                        y: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                        scale: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                      }}
                  style={{ transformOrigin: 'top center' }}
                  aria-label="音乐控制面板"
                >
                  <div className="qz-music-island-top">
                    <span className="qz-music-island-status">{track.isPlaying ? '正在播放' : '已暂停'}</span>
                    <button type="button" className="qz-music-island-icon-button" onClick={() => setExpanded(false)} aria-label="收起播放器">
                      <MusicIcon name="close" size={16} />
                    </button>
                  </div>
                  <button type="button" className="qz-music-island-track" onClick={() => navigate('/music')}>
                    {track.coverUrl ? (
                      <motion.img key={track.coverUrl} layoutId="qz-music-island-cover" className="qz-music-island-cover" src={track.coverUrl} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }} />
                    ) : (
                      <motion.span key="fallback" layoutId="qz-music-island-cover" className="qz-music-island-cover qz-music-island-cover-fallback" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>♫</motion.span>
                    )}
                    <span className="qz-music-island-track-copy">
                      <motion.strong key={track.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>{track.title}</motion.strong>
                      <motion.span key={track.artist} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>{track.artist || '未知歌手'}</motion.span>
                    </span>
                    <span className={'qz-music-equalizer ' + (track.isPlaying ? 'is-playing' : '')} aria-hidden="true">
                      <i /><i /><i /><i />
                    </span>
                  </button>
                  <div className="qz-music-island-progress">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, track.duration)}
                      step={1}
                      value={Math.min(track.duration || 0, seekDraft ?? track.currentTime)}
                      onChange={event => {
                        const value = Number(event.target.value);
                        seekDraftRef.current = value;
                        setSeekDraft(value);
                      }}
                      onPointerUp={commitSeekDraft}
                      onPointerCancel={cancelSeekDraft}
                      onKeyUp={commitSeekDraft}
                      onBlur={commitSeekDraft}
                      aria-label="歌曲播放进度"
                      disabled={!connected || track.duration <= 0}
                    />
                    <div><span>{formatTime(track.currentTime)}</span><span>{formatTime(track.duration)}</span></div>
                  </div>
                  <div className="qz-music-island-controls">
                    <button type="button" onClick={() => sendCommand('previous')} disabled={!connected || !track.canPrevious} aria-label="上一首">
                      <MusicIcon name="previous" size={20} />
                    </button>
                    <button type="button" className="qz-music-play-button" onClick={() => sendCommand('toggle')} disabled={!connected || !track.canToggle} aria-label={track.isPlaying ? '暂停' : '播放'}>
                      <MusicIcon name={track.isPlaying ? 'pause' : 'play'} size={19} />
                    </button>
                    <button type="button" onClick={() => sendCommand('next')} disabled={!connected || !track.canNext} aria-label="下一首">
                      <MusicIcon name="next" size={20} />
                    </button>
                    <button type="button" onClick={() => navigate('/music')} aria-label="打开音乐空间">
                      <MusicIcon name="list" size={18} />
                    </button>
                  </div>
                </motion.section>
              ) : (
                <motion.div
                  key="collapsed"
                  className="qz-music-island qz-music-island-collapsed"
                  layoutId="qz-music-island-shell"
                  initial={false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={reduceMotion
                    ? { duration: 0 }
                    : {
                        layout: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                        opacity: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                        scale: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                      }}
                >
                  <button
                    type="button"
                    className="qz-music-island-collapsed-main"
                    onClick={() => setExpanded(true)}
                    aria-label={'展开播放器：' + track.title}
                  >
                    {track.coverUrl ? (
                      <motion.img key={track.coverUrl} layoutId="qz-music-island-cover" className="qz-music-island-mini-cover" src={track.coverUrl} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }} />
                    ) : (
                      <motion.span key="fallback" layoutId="qz-music-island-cover" className="qz-music-island-mini-cover qz-music-island-cover-fallback" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>♫</motion.span>
                    )}
                    <motion.span key={track.title} className="qz-music-island-mini-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>{track.title}</motion.span>
                    <span className={'qz-music-equalizer ' + (track.isPlaying ? 'is-playing' : '')} aria-hidden="true"><i /><i /><i /><i /></span>
                  </button>
                  <button
                    type="button"
                    className="qz-music-island-mini-play"
                    onClick={() => sendCommand('toggle')}
                    disabled={!connected || !track.canToggle}
                    aria-label={track.isPlaying ? '暂停音乐' : '继续播放音乐'}
                    title={track.isPlaying ? '暂停' : '播放'}
                  >
                    <MusicIcon name={track.isPlaying ? 'pause' : 'play'} size={15} />
                  </button>
                </motion.div>
              )}
              </AnimatePresence>
            </LayoutGroup>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default MusicIsland;
