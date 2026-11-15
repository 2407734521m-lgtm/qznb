import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
};
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Prefetch parallel overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Prefetch parallel overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// The prefetch window (two ahead, one behind) used to run strictly one song after another, and
// each song in turn resolved its URL, then fetched its lyrics, then ran the cross-platform
// best-lyrics search — up to nine serial round-trips before the window was done. A skipped-through
// track reached its transition with the next song's URL still unfetched.
// Two changes, both inside the window:
// 1. The three songs prefetch in parallel. Each still starts on an idle slot, so a busy frame is
//    not blocked, but they no longer wait for each other.
// 2. The best-lyrics search runs inline only for the immediate next track. The other two defer it
//    to an idle slot after the pass: their own lyrics are already in the entry, and playback's own
//    lyric path runs the same search if the song starts before the deferred one lands.

const servicePath = resolve(root, 'src/services/prefetchService.ts');
let service = await read(servicePath);

service = replaceOnce(service,
    `import type { AudioQualityPreference, MediaId } from '../types/onlineMusic';`,
    `import type { AudioQualityPreference, ChorusRange, MediaId } from '../types/onlineMusic';`,
    'ChorusRange import');

// The cross-platform best-lyrics search for one prefetched song, on its own so the immediate next
// track runs it inline while the rest of the window defers it to an idle slot (below). The lyric
// settings are read fresh: a deferred run may happen after the listener changed them. Returns the
// provider's own lyrics where nothing better matched, null where the song is pure music. A failed
// search is logged, never thrown: it leaves the provider's own lyrics.
service = replaceOnce(service,
    `/**
 * Prefetch a single song's resources
 */`,
    `/** The raw lyric set a deferred best-lyrics search needs: the provider's own texts. */
type PrefetchedLyricRaw = {
    mainLrc: string | null;
    yrcLrc: string | null;
    transLrc: string | null;
    isPureMusic: boolean;
    chorusRanges: ChorusRange[];
};

/** What the best-lyrics search leaves for a song: the lyrics to keep, and whether it proved the song has none. */
type PrefetchedLyricMatch = {
    finalLyrics: LyricData | null;
    pureMusic: boolean;
};

const autoMatchPrefetchedLyrics = async (
    song: SongResult,
    providerId: string | null | undefined,
    parsedLyrics: LyricData | null,
    processed: PrefetchedLyricRaw,
    onlineLyricsState: OnlineLyricsState | null,
): Promise<PrefetchedLyricMatch> => {
    const settingsLyricSettings = useLyricSettingsStore.getState();
    try {
        const metadata = getProviderSongMetadata(song);
        const artistName = metadata.artists.map(a => a.name).join(', ');
        const ownLyricSource = getPlatformLyricSource(providerId);
        const bestMatch = await autoMatchBestLyric(song.name, artistName, metadata.durationMs, {
            album: metadata.album?.name,
            preferredSource: settingsLyricSettings.preferredAlternativeLyricSource,
            keepOwnWordTiming: settingsLyricSettings.keepProviderWordTiming,
            alternateArtist: () => omni.getAlternateArtistName(song),
            searchAlias: () => omni.getLyricSearchAlias(song),
            ...(ownLyricSource
                ? { providerCandidate: {
                    providerId: ownLyricSource.id,
                    song,
                    lyricsResult: {
                        lyrics: parsedLyrics,
                        mainText: processed.mainLrc,
                        wordByWordText: processed.yrcLrc,
                        translationText: processed.transLrc,
                        isPureMusic: processed.isPureMusic,
                        chorusRanges: processed.chorusRanges,
                    },
                } }
                : {})
        });
        if (bestMatch && 'lyrics' in bestMatch && bestMatch.source !== providerId) {
            const overrideState: OnlineLyricsState = {
                lyricsSource: 'online',
                matchedSongId: bestMatch.id,
                hasOnlineOverride: true,
                onlineOverrideLyrics: bestMatch.lyrics,
                matchedLyricsSource: bestMatch.source,
                matchedLyricsProviderPlatform: bestMatch.matchedLyricsProviderPlatform,
            };
            await saveOnlineLyricsState(song, overrideState);
            return { finalLyrics: bestMatch.lyrics, pureMusic: false };
        }
        if (bestMatch?.isPureMusic) {
            // Same discriminator fix as in onlinePlayback: a MATCH object carries
            // \`isPureMusic: false\`, so the old \`'isPureMusic' in bestMatch\` also
            // caught a best match from the track's own provider and discarded it.
            await saveOnlineLyricsState(song, markOnlineLyricsPureMusic(onlineLyricsState));
            return { finalLyrics: null, pureMusic: true };
        }
        return { finalLyrics: parsedLyrics, pureMusic: false };
    } catch (error) {
        console.warn('[Prefetch] Failed to auto-match best lyric:', error);
        return { finalLyrics: parsedLyrics, pureMusic: false };
    }
};

// A best-lyrics search deferred past the prefetch pass, keyed by the song it belongs to.
type PendingAutoMatch = {
    song: SongResult;
    providerId: string | null | undefined;
    parsedLyrics: LyricData | null;
    processed: PrefetchedLyricRaw;
    onlineLyricsState: OnlineLyricsState | null;
};

const pendingAutoMatches = new Map<string, PendingAutoMatch>();
let deferredAutoMatchScheduled = false;

// One deferred search per idle slot, in the order they were queued. The lyrics state is re-read
// first: a newer override (the listener picked lyrics by hand, or playback's own search) settles
// the song, and this run stands down. The entry may have been replaced since (a newer prefetch
// pass): only the lyrics of the entry still standing for this song are touched.
const runDeferredAutoMatch = async (): Promise<void> => {
    deferredAutoMatchScheduled = false;
    const next = pendingAutoMatches.entries().next();
    if (next.done) return;
    const [songKey, pending] = next.value;
    pendingAutoMatches.delete(songKey);
    const freshState = await loadOnlineLyricsState(pending.song);
    if (freshState?.hasOnlineOverride) {
        scheduleDeferredAutoMatch();
        return;
    }
    const matched = await autoMatchPrefetchedLyrics(
        pending.song,
        pending.providerId,
        pending.parsedLyrics,
        pending.processed,
        freshState,
    );
    const entry = prefetchCache.get(songKey);
    if (entry) {
        entry.lyrics = matched.finalLyrics;
        if (matched.pureMusic && entry.lyricRaw) entry.lyricRaw.isPureMusic = true;
        touchPrefetchCacheEntry(songKey, entry);
    }
    scheduleDeferredAutoMatch();
};

const scheduleDeferredAutoMatch = (): void => {
    if (deferredAutoMatchScheduled || pendingAutoMatches.size === 0) return;
    deferredAutoMatchScheduled = true;
    const run = () => { void runDeferredAutoMatch(); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 100);
};

const queueDeferredAutoMatch = (songKey: string, pending: PendingAutoMatch): void => {
    pendingAutoMatches.set(songKey, pending);
    scheduleDeferredAutoMatch();
};

/**
 * Prefetch a single song's resources
 */`,
    'best-lyrics search helper and deferred queue');

// Only the immediate next track runs the search inline; the rest defer it past the pass.
service = replaceOnce(service,
    `const prefetchSong = async (
    song: SongResult,
    audioQuality: AudioQualityPreference,
    signal: AbortSignal,
    userId?: MediaId | null
): Promise<void> => {`,
    `const prefetchSong = async (
    song: SongResult,
    audioQuality: AudioQualityPreference,
    signal: AbortSignal,
    userId?: MediaId | null,
    options: { deferAutoMatch?: boolean } = {},
): Promise<void> => {`,
    'prefetchSong defer option');

service = replaceOnce(service,
    `                if (shouldAutoMatch) {
                    try {
                        const metadata = getProviderSongMetadata(song);
                        const artistName = metadata.artists.map(a => a.name).join(', ');
                        const ownLyricSource = getPlatformLyricSource(sourceRef.providerId);
                        const bestMatch = await autoMatchBestLyric(song.name, artistName, metadata.durationMs, {
                            album: metadata.album?.name,
                            preferredSource: settingsLyricSettings.preferredAlternativeLyricSource,
                            keepOwnWordTiming: settingsLyricSettings.keepProviderWordTiming,
                            alternateArtist: () => omni.getAlternateArtistName(song),
                            searchAlias: () => omni.getLyricSearchAlias(song),
                            ...(ownLyricSource
                                ? { providerCandidate: {
                                    providerId: ownLyricSource.id,
                                    song,
                                    lyricsResult: {
                                        lyrics: parsedLyrics,
                                        mainText: processed.mainLrc,
                                        wordByWordText: processed.yrcLrc,
                                        translationText: processed.transLrc,
                                        isPureMusic: processed.isPureMusic,
                                        chorusRanges: processed.chorusRanges,
                                    },
                                } }
                                : {})
                        });
                        if (bestMatch && 'lyrics' in bestMatch && bestMatch.source !== sourceRef.providerId) {
                            const overrideState: OnlineLyricsState = {
                                lyricsSource: 'online',
                                matchedSongId: bestMatch.id,
                                hasOnlineOverride: true,
                                onlineOverrideLyrics: bestMatch.lyrics,
                                matchedLyricsSource: bestMatch.source,
                                matchedLyricsProviderPlatform: bestMatch.matchedLyricsProviderPlatform,
                            };
                            await saveOnlineLyricsState(song, overrideState);
                            finalLyrics = bestMatch.lyrics;
                        } else if (bestMatch?.isPureMusic) {
                            // Same discriminator fix as in onlinePlayback: a MATCH object carries
                            // \`isPureMusic: false\`, so the old \`'isPureMusic' in bestMatch\` also
                            // caught a best match from the track's own provider and discarded it.
                            await saveOnlineLyricsState(song, markOnlineLyricsPureMusic(onlineLyricsState));
                            finalLyrics = null;
                            if (data.lyricRaw) data.lyricRaw.isPureMusic = true;
                        }
                    } catch (error) {
                        console.warn('[Prefetch] Failed to auto-match best lyric:', error);
                    }
                } else {`,
    `                if (shouldAutoMatch && options.deferAutoMatch) {
                    // The provider's own lyrics stand in the entry for now; the search runs on an
                    // idle slot after the pass and writes the better match into the entry in place.
                    queueDeferredAutoMatch(songKey, {
                        song,
                        providerId: sourceRef.providerId,
                        parsedLyrics,
                        processed,
                        onlineLyricsState,
                    });
                } else if (shouldAutoMatch) {
                    const matched = await autoMatchPrefetchedLyrics(song, sourceRef.providerId, parsedLyrics, processed, onlineLyricsState);
                    finalLyrics = matched.finalLyrics;
                    if (matched.pureMusic && data.lyricRaw) data.lyricRaw.isPureMusic = true;
                } else {`,
    'deferred best-lyrics search branch');

// The window prefetches in parallel: each song still starts on an idle slot, so a busy frame is
// not blocked, but the three no longer wait for each other.
service = replaceOnce(service,
    `    // Prefetch using requestIdleCallback for non-blocking execution
    const prefetchWithIdle = (songs: SongResult[], index: number) => {
        if (signal.aborted || index >= songs.length) return;

        const song = songs[index];

        if ('requestIdleCallback' in window) {
            requestIdleCallback(
                async () => {
                    if (signal.aborted) return;
                    await prefetchSong(song, audioQuality, signal, userId);
                    prefetchWithIdle(songs, index + 1);
                },
                { timeout: 5000 }
            );
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(async () => {
                if (signal.aborted) return;
                await prefetchSong(song, audioQuality, signal, userId);
                prefetchWithIdle(songs, index + 1);
            }, 100);
        }
    };

    prefetchWithIdle(songsToPrefetch, 0);`,
    `    // Prefetch in parallel, each song starting on its own idle slot: a busy frame is still not
    // blocked, but a slow lyric search for one song no longer holds the next song's URL behind it.
    // songsToPrefetch[0] is the immediate next track (forwards first, the repeat-all wrap unshifted
    // to the front), so only it runs the best-lyrics search inline; the rest defer it.
    songsToPrefetch.forEach((song, index) => {
        const start = () => {
            if (signal.aborted) return;
            void prefetchSong(song, audioQuality, signal, userId, { deferAutoMatch: index !== 0 });
        };
        if ('requestIdleCallback' in window) {
            requestIdleCallback(start, { timeout: 5000 });
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(start, 100);
        }
    });`,
    'parallel prefetch launch');

// A queue edit drops the deferred searches of songs that left the window; the ones still in it
// keep theirs (a newer pass re-queues them if it re-enters their song).
service = replaceOnce(service,
    `export const cleanupPrefetchCache = (currentQueue: SongResult[]): void => {
    const queueIds = new Set(currentQueue.map((song) => getPrefetchSongKey(song)));

    for (const songKey of prefetchCache.keys()) {
        if (!queueIds.has(songKey)) {
            prefetchCache.delete(songKey);
        }
    }`,
    `export const cleanupPrefetchCache = (currentQueue: SongResult[]): void => {
    const queueIds = new Set(currentQueue.map((song) => getPrefetchSongKey(song)));

    for (const songKey of prefetchCache.keys()) {
        if (!queueIds.has(songKey)) {
            prefetchCache.delete(songKey);
        }
    }

    for (const songKey of pendingAutoMatches.keys()) {
        if (!queueIds.has(songKey)) {
            pendingAutoMatches.delete(songKey);
        }
    }`,
    'cleanup prunes deferred searches');

// Aborting the pass also stands down the deferred searches it queued.
service = replaceOnce(service,
    `export const clearPrefetchRuntime = (): void => {
    currentPrefetchAbortController?.abort();
    currentPrefetchAbortController = null;
    prefetchCache.clear();
    analysisScopeSongs = [];
};`,
    `export const clearPrefetchRuntime = (): void => {
    currentPrefetchAbortController?.abort();
    currentPrefetchAbortController = null;
    prefetchCache.clear();
    pendingAutoMatches.clear();
    analysisScopeSongs = [];
};`,
    'clear drops deferred searches');

await write(servicePath, service);

// The parallel launch and the deferred search, driven with controllable fetches: all three songs'
// audio requests start before any of them resolves; the search runs inline only for the immediate
// next track, and lands in the other entries once the idle slot runs.
const testPath = resolve(root, 'test/unit/prefetchParallel.test.ts');
const testSource = `// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyricData, SongResult } from '@/types';

const getAudioSourceMock = vi.hoisted(() => vi.fn());
const getLyricsMock = vi.hoisted(() => vi.fn());
const autoMatchMock = vi.hoisted(() => vi.fn());
const loadLyricsStateMock = vi.hoisted(() => vi.fn(async () => null));
const saveLyricsStateMock = vi.hoisted(() => vi.fn(async () => undefined));
const hasCachedAudioMock = vi.hoisted(() => vi.fn(async () => false));
const getSongCacheMock = vi.hoisted(() => vi.fn(async () => null));
const lyricSettings = vi.hoisted(() => ({
    autoUseBestLyric: true,
    preferredAlternativeLyricSource: 'qq',
    keepProviderWordTiming: true,
}));

vi.mock('@/services/onlineMusic/omni', () => ({
    omni: {
        canPlayExternally: () => false,
        canPlaySong: () => true,
        getAudioSource: getAudioSourceMock,
        getLyrics: getLyricsMock,
        getAlternateArtistName: () => null,
        getLyricSearchAlias: () => null,
        prefersOwnWordByWordLyrics: () => false,
        resolveAudioQuality: (_providerId: string, preference: string) => preference,
        audioSourceMetadataVersion: () => 0,
        previewClipStartMsOfAudioSource: () => 0,
    },
}));

vi.mock('@/services/onlineMusic/resourceCache', () => ({
    getSongCacheWithLegacyMigration: getSongCacheMock,
    hasCachedSongAudio: hasCachedAudioMock,
}));

vi.mock('@/utils/onlineLyricsState', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/onlineLyricsState')>()),
    loadOnlineLyricsState: loadLyricsStateMock,
    saveOnlineLyricsState: saveLyricsStateMock,
}));

vi.mock('@/utils/lyrics/autoMatchBestLyric', () => ({
    autoMatchBestLyric: autoMatchMock,
}));

vi.mock('@/stores/useLyricSettingsStore', () => ({
    useLyricSettingsStore: { getState: () => lyricSettings },
}));

import { clearPrefetchRuntime, getPrefetchedData, prefetchNearbySongs } from '@/services/prefetchService';

// test/unit/prefetchParallel.test.ts
// The prefetch window fetches its three songs in parallel, and only the immediate next track runs
// the cross-platform best-lyrics search inline: the rest defer it to an idle slot, and the better
// lyrics land in their entries when that slot runs.

const song = (id: string): SongResult => ({
    id,
    name: \`Song \${id}\`,
    artists: [{ id: 'a', name: 'Artist' }],
    album: { id: '', name: '' },
    durationMs: 200000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: id },
} as unknown as SongResult);

const lyricsFor = (id: string): LyricData => ({
    lines: [{ startTime: 0, endTime: 10, fullText: \`lyrics \${id}\`, words: [] }],
} as unknown as LyricData);

describe('parallel prefetch window', () => {
    // The current song sits at index 1, so the window is the previous song plus the next two:
    // [c, d, a] — the immediate next track (c) first, then the rest.
    const queue = [song('a'), song('b'), song('c'), song('d')];
    const current = queue[1];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        getAudioSourceMock.mockImplementation(async (track: SongResult) => ({ url: \`https://audio.test/\${track.id}.mp3\` }));
        getLyricsMock.mockImplementation(async (track: SongResult) => ({
            mainText: \`lrc \${track.id}\`,
            wordByWordText: null,
            translationText: null,
            isPureMusic: false,
            lyrics: lyricsFor(String(track.id)),
            chorusRanges: [],
        }));
        autoMatchMock.mockImplementation(async (name: string) => ({
            id: \`matched-\${name}\`,
            source: 'qq',
            lyrics: lyricsFor(\`matched-\${name}\`),
        }));
    });

    afterEach(() => {
        clearPrefetchRuntime();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('starts all three songs before any of them resolves', async () => {
        let resolveFirst: ((value: unknown) => void) | undefined;
        const firstGate = new Promise(resolve => { resolveFirst = resolve; });
        getAudioSourceMock.mockImplementationOnce(() => firstGate);
        const pending = prefetchNearbySongs(current, queue, 'high');
        await vi.advanceTimersByTimeAsync(100);
        // The second and third songs' audio requests are already in flight while the first is held.
        expect(getAudioSourceMock.mock.calls.map(call => (call[0] as SongResult).id)).toEqual(['c', 'd', 'a']);
        resolveFirst!({ url: 'https://audio.test/c.mp3' });
        await pending;
        await vi.runAllTimersAsync();
        expect(getAudioSourceMock).toHaveBeenCalledTimes(3);
    });

    it('searches inline only for the immediate next track and defers the rest', async () => {
        const pending = prefetchNearbySongs(current, queue, 'high');
        await vi.advanceTimersByTimeAsync(100);
        await pending;
        // Microtasks only: the songs finish without the deferred idle slots firing.
        await vi.runAllTicks();
        // Inline: only the immediate next track (c) searched before the pass finished.
        expect(autoMatchMock.mock.calls.map(call => call[0])).toEqual(['Song c']);
        // The deferred searches run on the idle slots that follow, and land in their entries.
        await vi.advanceTimersByTimeAsync(1000);
        await vi.runAllTimersAsync();
        expect(autoMatchMock.mock.calls.map(call => call[0])).toEqual(['Song c', 'Song d', 'Song a']);
        expect(getPrefetchedData(queue[3])?.lyrics?.lines[0]?.fullText).toBe('lyrics matched-Song d');
    });

    it('drops deferred searches when the runtime is cleared', async () => {
        const pending = prefetchNearbySongs(current, queue, 'high');
        await vi.advanceTimersByTimeAsync(100);
        await pending;
        await vi.runAllTicks();
        clearPrefetchRuntime();
        await vi.advanceTimersByTimeAsync(1000);
        await vi.runAllTimersAsync();
        expect(autoMatchMock.mock.calls.map(call => call[0])).toEqual(['Song c']);
    });
});
`;
await writeNewFile(testPath, testSource, 'parallel prefetch unit test');

console.log('Applied parallel prefetch: window fetches in parallel, best-lyrics search inline only for the immediate next track.');
