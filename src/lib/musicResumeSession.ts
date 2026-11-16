/**
 * The music playback session, kept on this device so a reload of the music
 * station (tab switch, refresh, a discarded background iframe) can resume
 * from the same song and position instead of starting over at 0:00.
 *
 * Why this exists: the bridge only pushes STATE while the tab is visible,
 * and the main site keeps the track in memory only. When the station
 * reloads, it restores the queue but reports the song paused at 0:00 — and
 * nothing ever told it to carry on. So the main site persists the session
 * on every accepted STATE (throttled), mounts the hidden frame on boot when
 * a fresh session exists, and on (re)connect seeks back to the saved
 * position and plays again. No Folia change is needed: the existing
 * seek + toggle commands compose the resume.
 *
 * Boundaries: after a refresh with no user gesture yet, the browser's
 * autoplay policy may refuse audible playback (a fresh profile has no media
 * engagement for the station origin). The resume is best-effort then: the
 * position is still restored, and one tap resumes from the breakpoint
 * instead of from 0:00.
 */

export interface MusicResumeSession {
  title: string;
  artist: string;
  coverUrl: string | null;
  /** Whole seconds into the track when last saved. */
  position: number;
  /** Whole seconds of track length, 0 when unknown. */
  duration: number;
  /** Whether the track was playing when last saved. */
  isPlaying: boolean;
  /** Epoch ms of the save. */
  at: number;
}

export const MUSIC_RESUME_KEY = 'qznb_island_music_resume_v1';

/** A session older than this is stale: the user has moved on, don't autoplay it. */
export const MUSIC_RESUME_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** STATE pushes arrive every 700ms; saving every push would rewrite storage constantly. */
export const MUSIC_RESUME_SAVE_POSITION_STEP = 5;

/** A track that was this far in (or less) restarts from 0 anyway: no seek needed. */
export const MUSIC_RESUME_MIN_SEEK_POSITION = 2;

/** Don't resume into the last seconds of a track: it would end immediately. */
export const MUSIC_RESUME_END_MARGIN = 2;

/** Bounded retries: the bridge may ignore a command while the station is still booting. */
export const MUSIC_RESUME_MAX_ATTEMPTS = 3;

export type MusicResumeTrack = Pick<MusicResumeSession, 'title' | 'artist' | 'coverUrl' | 'isPlaying'> & {
  currentTime: number;
  duration: number;
};

/** Song identity for resume matching: title + artist. Cover art may re-resolve; it must not break a resume. */
export function musicResumeIdentity(track: Pick<MusicResumeSession, 'title' | 'artist'>): string {
  return track.title + '\n' + track.artist;
}

export function sessionFromTrack(track: MusicResumeTrack, at: number = Date.now()): MusicResumeSession {
  return {
    title: track.title.slice(0, 180),
    artist: track.artist.slice(0, 180),
    coverUrl: track.coverUrl ?? null,
    position: Number.isFinite(track.currentTime) ? Math.max(0, Math.floor(track.currentTime)) : 0,
    duration: Number.isFinite(track.duration) ? Math.max(0, Math.floor(track.duration)) : 0,
    isPlaying: track.isPlaying === true,
    at,
  };
}

/**
 * The pill's optimistic track for a freshly loaded page: paused at the saved
 * position until live STATE arrives and takes over. Previous/next are
 * optimistic (the queue normally has neighbours); the first live STATE
 * corrects them within seconds.
 */
export function resumeSessionToTrack(session: MusicResumeSession): MusicResumeTrack {
  return {
    title: session.title,
    artist: session.artist,
    coverUrl: session.coverUrl,
    isPlaying: false,
    currentTime: session.position,
    duration: session.duration,
  };
}

export function saveMusicResumeSession(session: MusicResumeSession): void {
  try {
    localStorage.setItem(MUSIC_RESUME_KEY, JSON.stringify(session));
  } catch {
    // Private mode or quota: resume just isn't available on this device.
  }
}

export function readMusicResumeSession(now: number = Date.now()): MusicResumeSession | null {
  try {
    const raw = localStorage.getItem(MUSIC_RESUME_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { title, artist, coverUrl, position, duration, isPlaying, at } = parsed as {
      title?: unknown;
      artist?: unknown;
      coverUrl?: unknown;
      position?: unknown;
      duration?: unknown;
      isPlaying?: unknown;
      at?: unknown;
    };
    if (typeof title !== 'string' || !title.trim()) return null;
    if (typeof at !== 'number' || !Number.isFinite(at) || now - at > MUSIC_RESUME_MAX_AGE_MS) return null;
    return {
      title: title.slice(0, 180),
      artist: typeof artist === 'string' ? artist.slice(0, 180) : '',
      coverUrl: typeof coverUrl === 'string' ? coverUrl : null,
      position: typeof position === 'number' && Number.isFinite(position) ? Math.max(0, Math.floor(position)) : 0,
      duration: typeof duration === 'number' && Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0,
      isPlaying: isPlaying === true,
      at,
    };
  } catch {
    return null;
  }
}

export function clearMusicResumeSession(): void {
  try {
    localStorage.removeItem(MUSIC_RESUME_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Whether a reconnected STATE may be resumed from this session: same song, fresh, mid-track. */
export function shouldResumeSession(
  session: MusicResumeSession | null,
  track: MusicResumeTrack,
  now: number = Date.now(),
): boolean {
  if (!session) return false;
  if (now - session.at > MUSIC_RESUME_MAX_AGE_MS) return false;
  if (musicResumeIdentity(session) !== musicResumeIdentity(track)) return false;
  if (!Number.isFinite(track.duration) || track.duration <= 0) return false;
  if (session.position < MUSIC_RESUME_MIN_SEEK_POSITION) return false;
  if (session.position >= track.duration - MUSIC_RESUME_END_MARGIN) return false;
  return true;
}

/** Whether the hidden music frame is worth mounting on boot to resume this session. */
export function shouldMountMusicFrameForResume(session: MusicResumeSession | null): boolean {
  if (!session) return false;
  return session.isPlaying || session.position >= 10;
}

/**
 * Whether the incoming track is worth persisting over the last saved
 * snapshot: a new song, a play/pause flip, or at least a step of progress.
 */
export function shouldSaveResumeSession(
  previous: MusicResumeSession | null,
  next: MusicResumeTrack,
): boolean {
  if (!previous) return true;
  if (musicResumeIdentity(previous) !== musicResumeIdentity(next)) return true;
  if (previous.isPlaying !== next.isPlaying) return true;
  const position = Number.isFinite(next.currentTime) ? Math.floor(next.currentTime) : 0;
  return Math.abs(position - previous.position) >= MUSIC_RESUME_SAVE_POSITION_STEP;
}
