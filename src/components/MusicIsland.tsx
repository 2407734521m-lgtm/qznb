import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useIslandActions, useIslandActivityIds } from '../lib/island';
import { createMusicIslandActivity, MusicIslandView } from './QianzhiMusicIslandActivity';
import MusicFullscreenPlayer from './MusicFullscreenPlayer';
import { useLocation, useNavigate } from 'react-router-dom';
import { haptic } from '../lib/haptics';
import { saveIslandLastTrack } from '../lib/islandLastTrack';
import {
  MUSIC_RESUME_MAX_ATTEMPTS,
  MUSIC_RESUME_MIN_SEEK_POSITION,
  clearMusicResumeSession,
  readMusicResumeSession,
  resumeSessionToTrack,
  saveMusicResumeSession,
  sessionFromTrack,
  shouldMountMusicFrameForResume,
  shouldResumeSession,
  shouldSaveResumeSession,
  type MusicResumeSession,
} from '../lib/musicResumeSession';
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

export const EQUALIZER_BANDS = ['bass', 'lowMid', 'vocal', 'treble'] as const;
/** Bar level the equalizer rests at while nothing is playing. */
export const EQUALIZER_REST_LEVEL = '.12';

/**
 * The fullscreen player is rendered outside the island host, so the only way it can read the
 * equalizer variables and mode is from <html>. Writing a custom property on <html> makes the
 * browser re-check styles across the whole page on every spectrum message, so that mirror
 * exists only while the player is on screen. The player's render condition uses this too, so
 * the two cannot drift apart.
 */
export function shouldMirrorEqualizerToRoot(fullPlayerOpen: boolean, hasTrack: boolean, isMusicPage: boolean): boolean {
  return fullPlayerOpen && hasTrack && !isMusicPage;
}

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

/** Identity of the song the island shows: a new key means a different song, not just a newer second. */
export function musicTrackIdentity(track: Pick<MusicTrack, 'title' | 'artist' | 'coverUrl'> | null): string | null {
  if (!track) return null;
  return track.title + '\n' + track.artist + '\n' + (track.coverUrl ?? '');
}

/**
 * Whether a song change should blur-and-fade the island's content layer instead of swapping it
 * in place. Only when music is the one activity on show in compact form: while expanded the
 * cover and title already arrive with their own keyed animation, and while another activity
 * shares the island the layer also carries that activity, which must not re-animate.
 */
export function shouldCrossfadeMusicTrack(
  previousIdentity: string | null,
  nextIdentity: string | null,
  soleMusicActivity: boolean,
  isCompact: boolean,
): boolean {
  if (previousIdentity === null || nextIdentity === null) return false;
  if (previousIdentity === nextIdentity) return false;
  return soleMusicActivity && isCompact;
}

/**
 * Whether the incoming STATE means the song has played to the end. The music
 * station never clears currentSong when the queue ends: it keeps pushing the
 * finished song as paused at its full length, so the island must treat that
 * as the end of the track session, not as a song paused mid-way. Progress is
 * whole seconds, so a track counts as finished one second before its end.
 */
/** Paused at (or within a second of) the end of a track with a known length. */
function isMusicTrackAtEnd(track: MusicTrack): boolean {
  if (track.isPlaying) return false;
  if (!Number.isFinite(track.duration) || track.duration <= 0) return false;
  return track.currentTime >= track.duration - 1;
}

export function isMusicTrackFinished(
  previous: MusicTrack | null,
  next: MusicTrack,
): boolean {
  if (!previous) return false;
  if (musicTrackIdentity(previous) !== musicTrackIdentity(next)) return false;
  return isMusicTrackAtEnd(next);
}

/**
 * Whether a STATE push is the bridge still re-sending a song whose grace
 * window already elapsed. Those pushes must not resurrect the pill: the
 * session ended, and only a live change to the song (playing, or paused
 * mid-track) brings it back.
 */
export function isEndedTrackPush(
  next: MusicTrack,
  endedIdentity: string | null,
): boolean {
  if (endedIdentity === null) return false;
  if (musicTrackIdentity(next) !== endedIdentity) return false;
  return isMusicTrackAtEnd(next);
}

/** The pill's accessible name: a neutral one while no song is live. */
export function resolveMusicIslandLabel(track: MusicTrack | null): string {
  if (!track) return '还没放歌';
  return (track.isPlaying ? '正在播放：' : '已暂停：') + track.title;
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
  // A playback session saved before a reload or an iframe reset: the pill
  // shows it (paused, at the saved position) until live STATE arrives, and
  // the hidden frame mounts so the bridge can reconnect and resume it.
  const [initialResumeSession] = useState<MusicResumeSession | null>(() => readMusicResumeSession());
  const [track, setTrack] = useState<MusicTrack | null>(() => {
    if (!initialResumeSession) return null;
    const resumed = resumeSessionToTrack(initialResumeSession);
    return { ...resumed, canPrevious: true, canNext: true, canToggle: true, volume: null, isMuted: false };
  });
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);
  const fullscreenPlayerVisible = shouldMirrorEqualizerToRoot(fullPlayerOpen, track !== null, isMusicPage);
  const equalizerRootRef = useRef(false);
  const seekDraftRef = useRef<number | null>(null);
  const lastStateMessageAtRef = useRef(0);
  const lastTrackRef = useRef<MusicTrack | null>(track);
  // A song ending sends track:null — or, when the queue runs out, the bridge
  // keeps pushing the finished song as paused at its full length (the station
  // never clears currentSong). Either way the next song, if any, arrives on
  // the next STATE: ending the activity at once makes the pill blink out for
  // a beat at every track change. The grace timer holds the last track as
  // paused instead; only if nothing arrives within the window does the island
  // go away.
  const graceTimerRef = useRef<number | null>(null);
  const graceActiveRef = useRef(false);
  // Identity of the song whose grace window already elapsed. The bridge keeps
  // pushing that finished song every 700ms; without remembering it, the next
  // push after the window would bring the pill straight back.
  const endedTrackIdentityRef = useRef<string | null>(null);
  // Resume after the bridge drops and comes back (tab switch, refresh, a
  // discarded background iframe): the station restores the queue but reports
  // the song paused at 0:00. Armed on every (re)connect; fires at most a few
  // times while the track still looks reset, then disarms so it can never
  // fight a pause the user made themselves.
  const resumeArmedRef = useRef(false);
  const resumeAttemptsRef = useRef(0);
  // Last snapshot written to storage, so STATE pushes (every 700ms) don't rewrite it constantly.
  const lastSavedResumeRef = useRef<MusicResumeSession | null>(initialResumeSession);
  const mountForResume = shouldMountMusicFrameForResume(initialResumeSession);
  const shouldMountFrame = openedOnce || isMusicPage || mountForResume;
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

  // Keep <html> carrying the equalizer state only while the fullscreen player needs it.
  useEffect(() => {
    equalizerRootRef.current = fullscreenPlayerVisible;
    if (!fullscreenPlayerVisible) return;
    const root = document.documentElement;
    const host = islandWrapRef.current;
    // Seed from what the island already shows so the player's bars do not restart from rest.
    root.dataset.qzMusicEqMode = host?.dataset.qzMusicEqMode ?? 'idle';
    for (const name of EQUALIZER_BANDS) {
      const shown = host?.style.getPropertyValue(`--qz-music-eq-${name}`);
      root.style.setProperty(`--qz-music-eq-${name}`, shown || EQUALIZER_REST_LEVEL);
    }
    // Writing stops on close but the last values stay on <html>: the player's exit animation
    // still reads them, and the next open seeds them again.
    return () => {
      equalizerRootRef.current = false;
    };
  }, [fullscreenPlayerVisible]);

  useEffect(() => {
    if (!shouldMountFrame) return;
    // The island host always rests; <html> only when the fullscreen player is mirroring it.
    const restEqualizer = () => {
      const host = islandWrapRef.current;
      if (host) {
        host.setAttribute('data-qz-music-eq-mode', 'idle');
        for (const name of EQUALIZER_BANDS) host.style.setProperty(`--qz-music-eq-${name}`, EQUALIZER_REST_LEVEL);
      }
      if (equalizerRootRef.current) {
        const root = document.documentElement;
        root.dataset.qzMusicEqMode = 'idle';
        for (const name of EQUALIZER_BANDS) root.style.setProperty(`--qz-music-eq-${name}`, EQUALIZER_REST_LEVEL);
      }
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== MUSIC_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as Partial<MusicStateMessage> | Partial<MusicSpectrumMessage> | null;
      if (!message || message.source !== 'qznb-music' || message.version !== 1) return;

      if (message.type === 'SPECTRUM') {
        const spectrum = message as MusicSpectrumMessage;
        const host = islandWrapRef.current;
        if (!host) return;
        const style = host.style;
        const root = equalizerRootRef.current ? document.documentElement : null;
        const equalizerMode = resolveMusicEqualizerMode(spectrum);
        // Messages arrive many times a second and the mode rarely changes: write it only on change.
        if (host.dataset.qzMusicEqMode !== equalizerMode) host.dataset.qzMusicEqMode = equalizerMode;
        if (root && root.dataset.qzMusicEqMode !== equalizerMode) root.dataset.qzMusicEqMode = equalizerMode;
        if (equalizerMode === 'idle' && root) {
          for (const name of EQUALIZER_BANDS) root.style.setProperty('--qz-music-eq-' + name, EQUALIZER_REST_LEVEL);
        }
        if (equalizerMode !== 'live') return;

        const names = EQUALIZER_BANDS;
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
          root?.style.setProperty(`--qz-music-eq-${name}`, measured);
        }
        return;
      }

      if (message.type !== 'STATE') return;
      lastStateMessageAtRef.current = Date.now();
      setConnected(true);
      setShowFallback(false);
      const clearGraceTimer = () => {
        if (graceTimerRef.current !== null) window.clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
        graceActiveRef.current = false;
      };
      // The equalizer only moves while a song is playing; once playback stops the
      // bars fall back to their idle level instead of freezing on the last frame.
      // Hold a finished track as paused (its play control disabled) instead of
      // dropping the pill the instant a song ends; the next song usually
      // arrives on the next STATE. Only if nothing arrives within the grace
      // window does the activity end. Already running: the bridge re-pushes
      // every 700ms, so a second call must not rebuild the timer.
      const startGrace = (held: MusicTrack) => {
        if (graceActiveRef.current) return;
        graceActiveRef.current = true;
        const graceTrack: MusicTrack = { ...held, isPlaying: false, canToggle: false, currentTime: held.duration };
        lastTrackRef.current = graceTrack;
        setTrack(graceTrack);
        graceTimerRef.current = window.setTimeout(() => {
          graceTimerRef.current = null;
          graceActiveRef.current = false;
          endedTrackIdentityRef.current = musicTrackIdentity(lastTrackRef.current);
          lastTrackRef.current = null;
          setTrack(null);
          // The queue ran out: nothing is left to resume later.
          clearMusicResumeSession();
          lastSavedResumeRef.current = null;
        }, 25000);
      };
      if (!message.track || typeof message.track.title !== 'string') {
        restEqualizer();
        const last = lastTrackRef.current;
        if (last) startGrace(last);
        return;
      }
      const incoming = message.track as MusicTrack;
      const duration = Number(incoming.duration);
      const currentTime = Number(incoming.currentTime);
      const volumeRaw = Number(incoming.volume);
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
      // The station never sends track:null when the queue runs out: it keeps
      // pushing the finished song as paused at its full length. Treat that as
      // the end of the session too, and check it BEFORE clearGraceTimer():
      // the bridge re-pushes every 700ms, so clearing first would restart the
      // grace window on every push and it would never elapse.
      if (isMusicTrackFinished(lastTrackRef.current, nextTrack)) {
        restEqualizer();
        startGrace(nextTrack);
        return;
      }
      // The grace already elapsed for this song, but the bridge keeps pushing
      // it finished every 700ms: swallow those pushes so the pill stays away.
      if (isEndedTrackPush(nextTrack, endedTrackIdentityRef.current)) {
        return;
      }
      clearGraceTimer();
      endedTrackIdentityRef.current = null;
      if (!incoming.isPlaying) {
        restEqualizer();
      }
      // The station restores the queue after a reload but reports the song
      // paused at 0:00, and it never resumes on its own. If this STATE is
      // one of the first after a (re)connect and the song still looks reset,
      // seek back to where it was and play again — but only while armed:
      // once the track is live, the arm drops so a pause the user makes
      // later in this connection is never overridden.
      if (resumeArmedRef.current) {
        const session = readMusicResumeSession();
        const resumable = session !== null && shouldResumeSession(session, nextTrack);
        if (resumable && !nextTrack.isPlaying && nextTrack.currentTime <= MUSIC_RESUME_MIN_SEEK_POSITION && resumeAttemptsRef.current < MUSIC_RESUME_MAX_ATTEMPTS) {
          postMusicCommand('seek', session.position);
          if (session.isPlaying) postMusicCommand('toggle');
          resumeAttemptsRef.current += 1;
          if (resumeAttemptsRef.current >= MUSIC_RESUME_MAX_ATTEMPTS) resumeArmedRef.current = false;
        } else {
          // Live again, a different song, or nothing worth resuming: disarm.
          resumeArmedRef.current = false;
        }
      }
      // The bridge pushes STATE every 700ms; most pushes change nothing the island shows.
      // Skipping those keeps the whole main-site tree from re-rendering on every push.
      if (!isSameMusicTrack(lastTrackRef.current, nextTrack)) {
        lastTrackRef.current = nextTrack;
        setTrack(nextTrack);
        saveIslandLastTrack({ title: nextTrack.title, artist: nextTrack.artist });
        // Persist the session for the next reload — but never let the reset
        // STATE that follows a reload overwrite the position it is about to
        // restore. While armed, only a live position may be saved.
        if (!resumeArmedRef.current || nextTrack.currentTime > MUSIC_RESUME_MIN_SEEK_POSITION) {
          const previous = lastSavedResumeRef.current;
          if (shouldSaveResumeSession(previous, nextTrack)) {
            const saved = sessionFromTrack(nextTrack);
            saveMusicResumeSession(saved);
            lastSavedResumeRef.current = saved;
          }
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (graceTimerRef.current !== null) window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
      graceActiveRef.current = false;
      endedTrackIdentityRef.current = null;
    };
  }, [shouldMountFrame]);

  useEffect(() => {
    if (!shouldMountFrame || connected) {
      setShowFallback(false);
      return;
    }
    const timer = window.setTimeout(() => setShowFallback(true), 12000);
    return () => window.clearTimeout(timer);
  }, [shouldMountFrame, connected, frameLoaded]);

  // Arm the resume on every (re)connect: the first STATEs after the bridge
  // comes back are where a reset song is spotted. The watchdog drops
  // `connected` while the tab is hidden, so a plain tab switch re-arms too —
  // but the arm only fires on the paused-at-0 signature, never on live audio.
  useEffect(() => {
    if (connected) {
      resumeArmedRef.current = true;
      resumeAttemptsRef.current = 0;
    }
  }, [connected]);

  // The bridge stops pushing STATE while the tab is hidden, so the last save
  // can lag the real position by a few seconds. Flush the latest known
  // track when the page goes away — playing tracks only: a paused track was
  // already saved when it was paused, and a reset position must never
  // overwrite the session it is about to restore.
  useEffect(() => {
    if (!shouldMountFrame) return;
    const flush = () => {
      const latest = lastTrackRef.current;
      if (!latest || !latest.isPlaying) return;
      const previous = lastSavedResumeRef.current;
      if (shouldSaveResumeSession(previous, latest)) {
        const saved = sessionFromTrack(latest);
        saveMusicResumeSession(saved);
        lastSavedResumeRef.current = saved;
      }
    };
    const onVisibility = () => {
      if (document.hidden) flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [shouldMountFrame]);

  // Post to the station without depending on the connected state: the STATE
  // handler that resumes playback runs from an effect closure, and the
  // arrival of STATE is itself proof the bridge is live.
  const postMusicCommand = (command: MusicCommand, value?: number) => {
    frameRef.current?.contentWindow?.postMessage({
      source: 'qznb-main',
      type: 'COMMAND',
      version: 1,
      command,
      value,
    }, MUSIC_ORIGIN);
  };

  const sendCommand = (command: MusicCommand, value?: number) => {
    if (!connected) return;
    postMusicCommand(command, value);
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

  const previousTrackIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (isMusicPage) return;
    if (!hasTrack || !track) {
      // The empty card's activity has no track: give the pill a neutral name
      // instead of the '音乐正在播放' it was created with.
      if (activityIds.includes('music-playback')) {
        islandApi.update('music-playback', { label: resolveMusicIslandLabel(null) });
      }
      return;
    }
    const nextIdentity = musicTrackIdentity(track);
    // A new song crossfades the whole compact layer instead of hard-swapping the title
    // and cover; a pause/resume or a progress tick keeps the in-place update.
    const crossfade = shouldCrossfadeMusicTrack(
      previousTrackIdentityRef.current,
      nextIdentity,
      activityIds.length === 1 && activityIds[0] === 'music-playback',
      islandApi.presentation === 'compact',
    );
    previousTrackIdentityRef.current = nextIdentity;
    islandApi.update('music-playback', {
      label: resolveMusicIslandLabel(track),
      ...(crossfade ? { transition: 'crossfade' as const } : {}),
    });
  }, [hasTrack, isMusicPage, track?.title, track?.artist, track?.coverUrl, track?.isPlaying, islandApi, activityIds]);

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
        {fullscreenPlayerVisible && track && (
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
