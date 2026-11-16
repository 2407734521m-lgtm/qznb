import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useIslandActions, useIslandActivityIds } from '../lib/island';
import { createMusicIslandActivity, MusicIslandView } from './QianzhiMusicIslandActivity';
import MusicFullscreenPlayer from './MusicFullscreenPlayer';
import { useLocation, useNavigate } from 'react-router-dom';
import { haptic } from '../lib/haptics';
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
  /** Player volume 0–1, or null when the connected music station does not report it. */
  volume: number | null;
  isMuted: boolean;
};

type MusicStateMessage = {
  source: 'qznb-music';
  type: 'STATE';
  version: 1;
  track: MusicTrack | null;
};

type MusicCommand = 'toggle' | 'previous' | 'next' | 'seek' | 'volume' | 'mute';

type MusicSpectrumMessage = {
  source: 'qznb-music';
  type: 'SPECTRUM';
  version: 1;
  playing: boolean;
  available: boolean;
  mode: 'spectrum' | 'level' | 'fallback' | 'idle';
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

/** A STATE track that changes nothing the island shows: same song, same state, same second. */
export function shouldShowMainIsland(isMusicPage: boolean, activityIds: readonly string[]): boolean {
  return !isMusicPage || activityIds.some(id => id !== 'music-playback');
}

export type MusicEqualizerMode = 'live' | 'fallback' | 'idle';

/** Use real spectrum/RMS data when it carries energy; otherwise keep the playing bars animated. */
export function resolveMusicEqualizerMode(
  spectrum: Pick<MusicSpectrumMessage, 'playing' | 'available' | 'mode' | 'level' | 'bands'>,
): MusicEqualizerMode {
  if (!spectrum.playing) return 'idle';

  // A valid analyser reading of zero is still real data: it means the audio is quiet,
  // not that the analyser disappeared. Keep the bars at their measured floor instead
  // of switching to a decorative animation that moves independently of the music.
  const bands = spectrum.bands;
  const hasSpectrum = spectrum.mode === 'spectrum'
    && spectrum.available
    && bands !== null
    && [bands.bass, bands.lowMid, bands.vocal, bands.treble].every(Number.isFinite);
  if (hasSpectrum) return 'live';

  // RMS level remains useful even when FFT bins are unavailable. Zero and near-zero
  // values are meaningful and must not be replaced by a fake equalizer animation.
  if (spectrum.mode === 'level' && Number.isFinite(spectrum.level)) return 'live';

  return 'fallback';
}

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
    && a.canToggle === b.canToggle
    && a.volume === b.volume
    && a.isMuted === b.isMuted;
}

function MusicIsland() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const islandApi = useIslandActions();
  const activityIds = useIslandActivityIds();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const islandWrapRef = useRef<HTMLDivElement | null>(null);
  const isMusicPage = location.pathname === '/music';
  const [openedOnce, setOpenedOnce] = useState(false);
  const [frameForeground, setFrameForeground] = useState(isMusicPage);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [track, setTrack] = useState<MusicTrack | null>(null);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);
  const seekDraftRef = useRef<number | null>(null);
  const lastStateMessageAtRef = useRef(0);
  const lastTrackRef = useRef<MusicTrack | null>(null);
  const shouldMountFrame = openedOnce || isMusicPage;
  const showMainIsland = shouldShowMainIsland(isMusicPage, activityIds);

  useEffect(() => {
    if (isMusicPage) {
      setOpenedOnce(true);
      setFrameForeground(true);
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
        const host = islandWrapRef.current;
        if (!host) return;
        const style = host.style;
        const rootStyle = document.documentElement.style;
        const equalizerMode = resolveMusicEqualizerMode(spectrum);
        host.dataset.qzMusicEqMode = equalizerMode;
        document.documentElement.dataset.qzMusicEqMode = equalizerMode;
        if (equalizerMode === 'idle') {
          for (const name of ['bass', 'lowMid', 'vocal', 'treble']) {
            rootStyle.setProperty('--qz-music-eq-' + name, '.12');
          }
        }
        if (equalizerMode !== 'live') return;

        const names = ['bass', 'lowMid', 'vocal', 'treble'] as const;
        const levelMultipliers = { bass: 0.68, lowMid: 0.86, vocal: 1, treble: 0.76 } as const;
        const spectrumBands = spectrum.mode === 'spectrum' && spectrum.available
          ? spectrum.bands
          : null;
        const rmsLevel = spectrum.mode === 'level'
          ? Math.max(0, Math.min(1, Number.isFinite(spectrum.level) ? spectrum.level : 0))
          : 0;
        for (const name of names) {
          const raw = spectrumBands ? spectrumBands[name] : rmsLevel * levelMultipliers[name];
          const energy = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw ?? 0)) : 0;
          // Frequency mode keeps four independent bands; RMS mode moves all bars with overall loudness.
          const measured = String(0.12 + energy * 0.88);
          style.setProperty(`--qz-music-eq-${name}`, measured);
          rootStyle.setProperty(`--qz-music-eq-${name}`, measured);
        }
        return;
      }

      if (message.type !== 'STATE') return;
      lastStateMessageAtRef.current = Date.now();
      setConnected(true);
      setShowFallback(false);
      if (!message.track || typeof message.track.title !== 'string') {
        islandWrapRef.current?.setAttribute('data-qz-music-eq-mode', 'idle');
        document.documentElement.dataset.qzMusicEqMode = 'idle';
        islandWrapRef.current?.style.setProperty('--qz-music-eq-bass', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-lowMid', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-vocal', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-treble', '.12');
        document.documentElement.style.setProperty('--qz-music-eq-bass', '.12');
        document.documentElement.style.setProperty('--qz-music-eq-lowMid', '.12');
        document.documentElement.style.setProperty('--qz-music-eq-vocal', '.12');
        document.documentElement.style.setProperty('--qz-music-eq-treble', '.12');
        lastTrackRef.current = null;
        setTrack(null);
        return;
      }
      const incoming = message.track as MusicTrack;
      const duration = Number(incoming.duration);
      const currentTime = Number(incoming.currentTime);
      const volumeRaw = Number(incoming.volume);
      if (!incoming.isPlaying) {
        islandWrapRef.current?.setAttribute('data-qz-music-eq-mode', 'idle');
        document.documentElement.dataset.qzMusicEqMode = 'idle';
        islandWrapRef.current?.style.setProperty('--qz-music-eq-bass', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-lowMid', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-vocal', '.12');
        islandWrapRef.current?.style.setProperty('--qz-music-eq-treble', '.12');
        document.documentElement.style.setProperty('--qz-music-eq-bass', '.12');
        document.documentElement.style.setProperty('--qz-music-eq-lowMid', '.12');
        document.documentElement.style.setProperty('--qz-music-eq-vocal', '.12');
        document.documentElement.style.setProperty('--qz-music-eq-treble', '.12');
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
        // Older music stations do not report volume: null keeps the island volume
        // control disabled instead of showing a made-up level.
        volume: Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw)) : null,
        isMuted: incoming.isMuted === true,
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

  const updateSeekDraft = (value: number) => {
    seekDraftRef.current = value;
    setSeekDraft(value);
  };

  const hasTrack = track !== null;

  // Tapping the pill expands the island in place (the volume slider lives
  // there); the fullscreen player is entered from the expanded island's open
  // button instead of hijacking the tap.
  const openFullscreenPlayer = () => {
    haptic('tick');
    setFullPlayerOpen(true);
    if (islandApi.presentation === 'expanded') islandApi.collapse();
  };

  // Keep the music activity mounted once per track session. Its content reads current track state
  // through context, avoiding a full activity-stack update on every playback clock tick.
  useEffect(() => {
    if (!hasTrack || isMusicPage) {
      islandApi.end('music-playback');
      return;
    }
    islandApi.start(createMusicIslandActivity(() => islandApi.expand('music-playback')));
    return () => islandApi.end('music-playback');
  }, [hasTrack, isMusicPage, islandApi]);

  useEffect(() => {
    if (!hasTrack || isMusicPage || !track) return;
    islandApi.update('music-playback', {
      label: (track.isPlaying ? '正在播放：' : '已暂停：') + track.title,
    });
  }, [hasTrack, isMusicPage, track?.title, track?.isPlaying, islandApi]);

  useEffect(() => {
    if (!track || isMusicPage || activityIds.some(id => id !== 'music-playback')) {
      setFullPlayerOpen(false);
    }
  }, [track?.title, isMusicPage, activityIds]);

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
        {fullPlayerOpen && track && !isMusicPage && (
          <MusicFullscreenPlayer
            key={track.title + ':' + track.artist}
            track={track}
            connected={connected}
            sendCommand={sendCommand}
            onMinimize={() => setFullPlayerOpen(false)}
            onOpenMusic={() => { setFullPlayerOpen(false); navigate('/music'); }}
          />
        )}
      </AnimatePresence>

      {showMainIsland && (
        <MusicIslandView
          hostRef={islandWrapRef}
          value={{
            track,
            connected,
            sendCommand,
            openMusic: () => navigate('/music'),
            openFullscreenPlayer,
            seekDraft,
            setSeekDraft: updateSeekDraft,
            commitSeekDraft,
            cancelSeekDraft,
            collapse: () => islandApi.collapse(),
            isExpanded: () => islandApi.presentation === 'expanded',
            activityIds,
          }}
        />
      )}
    </>
  );
}

export default MusicIsland;
