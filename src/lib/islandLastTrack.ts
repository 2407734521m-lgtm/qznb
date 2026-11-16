/** The last track the island showed, kept on this device so the settings preview
 * can show a real song title instead of a bare placeholder. Written by the music
 * bridge whenever a STATE with a track arrives; read by the island settings panel. */

export interface IslandLastTrack {
  title: string;
  artist: string;
}

const KEY = 'qznb_island_last_track_v1';

/** Fired on window whenever the last track changes, so an open settings panel can update live. */
export const ISLAND_TRACK_EVENT = 'qz-island-track';

export function saveIslandLastTrack(track: IslandLastTrack): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ title: track.title, artist: track.artist, at: Date.now() }));
    window.dispatchEvent(new CustomEvent(ISLAND_TRACK_EVENT, { detail: { title: track.title, artist: track.artist } }));
  } catch {
    // Private mode or quota: the preview just falls back to the sample title.
  }
}

export function readIslandLastTrack(): IslandLastTrack | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { title, artist } = parsed as { title?: unknown; artist?: unknown };
    if (typeof title !== 'string' || !title.trim()) return null;
    return { title: title.slice(0, 180), artist: typeof artist === 'string' ? artist.slice(0, 180) : '' };
  } catch {
    return null;
  }
}
