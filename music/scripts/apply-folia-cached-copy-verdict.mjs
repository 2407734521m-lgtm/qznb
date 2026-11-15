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
    if (first < 0) throw new Error('Cached copy verdict overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Cached copy verdict overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// Every play of a cached song decoded the file once more to prove it is the whole song, waiting
// up to 300ms for the header before it played. The proof is a property of the file, not of the
// play, so it is recorded once and trusted after that:
//
// - The verdict is recorded where the file is written: both writers that store a song's audio
//   (the end-of-song writer in playedTrackCache.ts, the automix analysis read in profileService.ts)
//   already measure the file through mayStoreSongAudio before they write it, so the check now
//   carries the measured length along and the writer records its verdict beside the audio, next
//   to the level it already saves there. A clip is never stored, so no clip verdict is recorded
//   at a write; a refused write leaves the old file and its old verdict alone.
// - Playback reads the record first: a recorded whole or unproven copy plays without another
//   probe. An old copy with no record is measured once, as before, and the verdict is recorded
//   then, so the next play skips the probe. A recorded clip is not trusted (the record describes
//   a file that was deleted); it is measured again and the delete path runs as before.
// - The record is filed with the song's other metadata (metadata_cache, like the level) and
//   cleared with the copy when it is deleted, so no stale verdict can stand in for a new file.

const keysPath = resolve(root, 'src/services/onlineMusic/resourceKeys.ts');
let keys = await read(keysPath);
keys = replaceOnce(keys,
    `export type SongResourceKind = 'audio' | 'lyric' | 'cover' | 'replayGain';`,
    `export type SongResourceKind = 'audio' | 'lyric' | 'cover' | 'replayGain' | 'audioLength';`,
    'audioLength resource kind');
await write(keysPath, keys);

const usagePath = resolve(root, 'src/services/repositories/cacheUsage.ts');
let usage = await read(usagePath);
usage = replaceOnce(usage,
    `  // describes that one copy, so it is cleared and counted with it in the same way.`,
    `  // describes that one copy, so it is cleared and counted with it in the same way. The length
  // verdict recorded for that copy ('audioLength_') describes it too.`,
    'media matcher comment');
usage = replaceOnce(usage,
    `  return key.startsWith('audio_') || key.startsWith('replayGain_') || key.startsWith('audioLevel_');`,
    `  return key.startsWith('audio_') || key.startsWith('replayGain_') || key.startsWith('audioLevel_') || key.startsWith('audioLength_');`,
    'media matcher knows the verdict prefix');
await write(usagePath, usage);

const repoPath = resolve(root, 'src/services/repositories/cacheRepository.ts');
let repo = await read(repoPath);
repo = replaceOnce(repo,
    `    key.startsWith('audioLevel_') ||`,
    `    key.startsWith('audioLevel_') ||
    key.startsWith('audioLength_') ||`,
    'audioLength bucket');
await write(repoPath, repo);

const cachePath = resolve(root, 'src/services/onlineMusic/resourceCache.ts');
let cache = await read(cachePath);
cache = replaceOnce(cache,
    `import { getFromCache, removeFromCache, saveToCache } from '../db';`,
    `import { getFromCache, removeFromCache, saveToCache } from '../db';
import type { SongAudioLength } from '../wholeSongCheck';`,
    'verdict type import');
cache = replaceOnce(cache,
    `export const saveSongAudioLevel = async (song: SongResult, level: AudioQualityPreference | undefined): Promise<void> => {
    if (level) await saveToCache(getSongAudioLevelKey(song), level);
    else await removeFromCache(getSongAudioLevelKey(song));
};`,
    `export const saveSongAudioLevel = async (song: SongResult, level: AudioQualityPreference | undefined): Promise<void> => {
    if (level) await saveToCache(getSongAudioLevelKey(song), level);
    else await removeFromCache(getSongAudioLevelKey(song));
};

/**
 * The length verdict of a song's cached audio, kept beside it like the level above: 'whole'
 * where the file was proven to be the whole song, 'unproven' where its length could not be told.
 * Recorded where the file is written, and where an old copy is first measured (see wholeCopy in
 * onlinePlayback.ts). A clip is never stored, so no clip verdict is recorded at a write.
 */
export const saveSongAudioLength = async (song: SongResult, verdict: SongAudioLength['verdict']): Promise<void> => {
    await saveToCache(getSongResourceCacheKey('audioLength', song), verdict);
};

/** The recorded length verdict of a song's cached audio, or null where none was recorded. */
export const getRecordedSongAudioLength = async (song: SongResult): Promise<SongAudioLength['verdict'] | null> => (
    getFromCache<SongAudioLength['verdict']>(getSongResourceCacheKey('audioLength', song))
);`,
    'verdict record helpers');
cache = replaceOnce(cache,
    `    if (deleted) await removeFromCache(getSongAudioLevelKey(song));`,
    `    if (deleted) {
        await removeFromCache(getSongAudioLevelKey(song));
        await removeFromCache(getSongResourceCacheKey('audioLength', song));
    }`,
    'verdict cleared with the copy');
await write(cachePath, cache);

const checkPath = resolve(root, 'src/services/wholeSongCheck.ts');
let check = await read(checkPath);
check = replaceOnce(check,
    `export type SongAudioStoreCheck = { store: true } | { store: false; why: string };`,
    `export type SongAudioStoreCheck = { store: true; length: SongAudioLength } | { store: false; why: string };`,
    'store check carries the measured length');
check = replaceOnce(check,
    `    if (length.verdict === 'whole' || (length.verdict === 'unproven' && !writesOver)) return { store: true };`,
    `    if (length.verdict === 'whole' || (length.verdict === 'unproven' && !writesOver)) return { store: true, length };`,
    'store check returns the measured length');
await write(checkPath, check);

const playbackPath = resolve(root, 'src/services/onlinePlayback.ts');
let playback = await read(playbackPath);
playback = replaceOnce(playback,
    `import { deleteCachedSongAudio, getCachedSongAudioBlob, getCachedSongReplayGain, getSongCacheWithLegacyMigration } from './onlineMusic/resourceCache';`,
    `import { deleteCachedSongAudio, getCachedSongAudioBlob, getCachedSongReplayGain, getRecordedSongAudioLength, getSongCacheWithLegacyMigration, saveSongAudioLength } from './onlineMusic/resourceCache';`,
    'verdict helpers import');
playback = replaceOnce(playback,
    `    const wholeCopy = async (blob: Blob | null): Promise<Blob | null> => {
        if (!blob) return null;
        const length = await measureSongAudio(song, blob, COPY_CHECK_CEILING_MS);
        if (length.verdict !== 'clip') return blob;`,
    `    const wholeCopy = async (blob: Blob | null): Promise<Blob | null> => {
        if (!blob) return null;
        // A copy whose length verdict was recorded at its write — or when an old copy was first
        // measured — plays without another decode probe (up to 300ms per play before this). A
        // recorded clip is not trusted: the record describes a file that was deleted.
        const recorded = await getRecordedSongAudioLength(song);
        if (recorded && recorded !== 'clip') return blob;
        const length = await measureSongAudio(song, blob, COPY_CHECK_CEILING_MS);
        if (length.verdict !== 'clip') await saveSongAudioLength(song, length.verdict);
        if (length.verdict !== 'clip') return blob;`,
    'wholeCopy trusts the recorded verdict');
await write(playbackPath, playback);

// Both writers record the verdict they already measured, beside the level they already save.
const playedPath = resolve(root, 'src/services/playedTrackCache.ts');
let played = await read(playedPath);
played = replaceOnce(played,
    `import { hasCachedSongAudio, hasCachedSongCover, saveSongAudioLevel } from './onlineMusic/resourceCache';`,
    `import { hasCachedSongAudio, hasCachedSongCover, saveSongAudioLength, saveSongAudioLevel } from './onlineMusic/resourceCache';`,
    'end-of-song writer verdict import');
played = replaceOnce(played,
    `                    await saveSongAudioLevel(song, level);`,
    `                    await saveSongAudioLevel(song, level);
                    await saveSongAudioLength(song, check.length.verdict);`,
    'end-of-song writer records the verdict');
await write(playedPath, played);

const profilePath = resolve(root, 'src/services/automix/profileService.ts');
let profile = await read(profilePath);
profile = replaceOnce(profile,
    `import { getCachedSongAudioBlob, hasCachedSongAudio, saveSongAudioLevel } from '../onlineMusic/resourceCache';`,
    `import { getCachedSongAudioBlob, hasCachedSongAudio, saveSongAudioLength, saveSongAudioLevel } from '../onlineMusic/resourceCache';`,
    'automix writer verdict import');
profile = replaceOnce(profile,
    `            await saveSongAudioLevel(song, level);`,
    `            await saveSongAudioLevel(song, level);
            await saveSongAudioLength(song, check.length.verdict);`,
    'automix writer records the verdict');
await write(profilePath, profile);

// playedTrackCache.test.ts and clipAnalysis.test.ts stub resourceCache: the writers' new
// verdict call needs its mock there, or the write path throws and the audio is not stored.
const playedTestPath = resolve(root, 'test/unit/playback/playedTrackCache.test.ts');
let playedTest = await read(playedTestPath);
playedTest = replaceOnce(playedTest,
    `const saveSongAudioLevel = vi.fn<(song: SongResult, level?: string) => Promise<void>>();`,
    `const saveSongAudioLevel = vi.fn<(song: SongResult, level?: string) => Promise<void>>();
const saveSongAudioLength = vi.fn<(song: SongResult, verdict: string) => Promise<void>>();`,
    'playedTrackCache test verdict delegate');
playedTest = replaceOnce(playedTest,
    `    saveSongAudioLevel: (song: SongResult, level?: string) => saveSongAudioLevel(song, level),`,
    `    saveSongAudioLevel: (song: SongResult, level?: string) => saveSongAudioLevel(song, level),
    saveSongAudioLength: (song: SongResult, verdict: string) => saveSongAudioLength(song, verdict),`,
    'playedTrackCache test verdict mock');
await write(playedTestPath, playedTest);

const clipTestPath = resolve(root, 'test/unit/automix/clipAnalysis.test.ts');
let clipTest = await read(clipTestPath);
clipTest = replaceOnce(clipTest,
    `const { stored, saveToCache, saveAudioBlob, saveSongAudioLevel, previews, cache, audioListeners, getCachedSongAudioBlob, keepProviderSongAudio, ownCache } = vi.hoisted(() => ({`,
    `const { stored, saveToCache, saveAudioBlob, saveSongAudioLevel, saveSongAudioLength, previews, cache, audioListeners, getCachedSongAudioBlob, keepProviderSongAudio, ownCache } = vi.hoisted(() => ({`,
    'clipAnalysis test verdict destructure');
clipTest = replaceOnce(clipTest,
    `    saveSongAudioLevel: vi.fn(),`,
    `    saveSongAudioLevel: vi.fn(),
    saveSongAudioLength: vi.fn(),`,
    'clipAnalysis test verdict mock fn');
clipTest = replaceOnce(clipTest,
    `    saveSongAudioLevel: (...args: unknown[]) => saveSongAudioLevel(...args),`,
    `    saveSongAudioLevel: (...args: unknown[]) => saveSongAudioLevel(...args),
    saveSongAudioLength: (...args: unknown[]) => saveSongAudioLength(...args),`,
    'clipAnalysis test verdict mock');
await write(clipTestPath, clipTest);

// The delete test: the verdict record is removed with the copy, beside the level.
const migrationTestPath = resolve(root, 'test/unit/onlineMusic/resourceCacheMigration.test.ts');
let migrationTest = await read(migrationTestPath);
migrationTest = replaceOnce(migrationTest,
    `    it('deletes the copy that was read under the song\\'s key and the legacy one, with its level', async () => {`,
    `    it('deletes the copy that was read under the song\\'s key and the legacy one, with its level and length verdict', async () => {`,
    'migration test name');
migrationTest = replaceOnce(migrationTest,
    `        await expect(deleteCachedSongAudio(legacyNeteaseSong, 5)).resolves.toBe(true);
        expect(vi.mocked(removeAudioBlob).mock.calls).toEqual([['audio_online:netease:42', 5], ['audio_42', 5]]);
        expect(removeFromCache).toHaveBeenCalledExactlyOnceWith('audioLevel_online:netease:42');`,
    `        await expect(deleteCachedSongAudio(legacyNeteaseSong, 5)).resolves.toBe(true);
        expect(vi.mocked(removeAudioBlob).mock.calls).toEqual([['audio_online:netease:42', 5], ['audio_42', 5]]);
        expect(removeFromCache).toHaveBeenCalledTimes(2);
        expect(removeFromCache).toHaveBeenCalledWith('audioLevel_online:netease:42');
        expect(removeFromCache).toHaveBeenCalledWith('audioLength_online:netease:42');`,
    'migration test expects both removals');
await write(migrationTestPath, migrationTest);

// onlinePlayback.test.ts exercises the cached-copy path (wholeCopy), which now reads and writes
// the verdict: its resourceCache mock gains the two helpers (no record yet) and the delete call.
const existingTestPath = resolve(root, 'test/unit/onlinePlayback.test.ts');
let existingTest = await read(existingTestPath);
existingTest = replaceOnce(existingTest,
    `vi.mock('@/services/onlineMusic/resourceCache', () => ({
    getCachedSongAudioBlob: cachedAudioMock,
    getCachedSongReplayGain: vi.fn(async () => undefined),
    getSongCacheWithLegacyMigration: songCacheMock,
}));`,
    `vi.mock('@/services/onlineMusic/resourceCache', () => ({
    deleteCachedSongAudio: vi.fn(async () => true),
    getCachedSongAudioBlob: cachedAudioMock,
    getCachedSongReplayGain: vi.fn(async () => undefined),
    getRecordedSongAudioLength: vi.fn(async () => null),
    getSongCacheWithLegacyMigration: songCacheMock,
    saveSongAudioLength: vi.fn(async () => undefined),
}));`,
    'existing playback test resourceCache mock');
await write(existingTestPath, existingTest);

// The verdict is filed with the song's other metadata, counted and cleared with it.
const categoryTestPath = resolve(root, 'test/unit/cache/audioLengthCategory.test.ts');
const categoryTestSource = `import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearBrowserCacheByCategory, getBrowserCacheUsageByCategory } from '@/services/repositories/cacheRepository';
import { appDatabase } from '@/services/appDatabase';
import { saveSongAudioLength } from '@/services/onlineMusic/resourceCache';
import type { SongResult } from '@/types';

// test/unit/cache/audioLengthCategory.test.ts
// The length verdict recorded for a cached song is filed, counted and cleared with that song.
//
// The key is built in resourceCache.ts and matched by its prefix in cacheRepository.ts, and nothing
// but these tests ties the two together. A prefix the router does not know falls into the api_cache
// bucket and into no category, where no button on the settings page reaches it. Cleared with any
// other category it would be worse than an orphan: the copy would play without the probe that
// proves it is the whole song, with nothing to show it.

const song = {
    id: '42',
    name: 'Song',
    sourceRef: { kind: 'online', providerId: 'ytm', mediaId: '42' },
} as unknown as SongResult;

const rowsIn = async () => ({
    api: await appDatabase.api_cache.count(),
    media: await appDatabase.media_cache.count(),
    metadata: await appDatabase.metadata_cache.count(),
    user: await appDatabase.user_cache.count(),
});

describe('the recorded length verdict of a cached song', () => {
    beforeEach(async () => {
        await Promise.all([
            appDatabase.api_cache.clear(),
            appDatabase.media_cache.clear(),
            appDatabase.metadata_cache.clear(),
            appDatabase.user_cache.clear(),
        ]);
        await saveSongAudioLength(song, 'whole');
    });

    it('is filed with the song\\'s other metadata', async () => {
        expect(await rowsIn()).toEqual({ api: 0, media: 0, metadata: 1, user: 0 });
    });

    it('counts towards the songs, without counting as a song', async () => {
        const usage = await getBrowserCacheUsageByCategory();

        expect(usage.media).toBeGreaterThan(0);
        expect(usage.mediaCount).toBe(0);
        expect(usage.playlist + usage.lyrics + usage.cover + usage.analysis).toBe(0);
    });

    it('is cleared with the songs', async () => {
        await clearBrowserCacheByCategory('media');

        expect((await rowsIn()).metadata).toBe(0);
    });

    it('survives every other button', async () => {
        for (const category of ['playlist', 'lyrics', 'cover', 'analysis'] as const) {
            await clearBrowserCacheByCategory(category);
        }

        expect((await rowsIn()).metadata).toBe(1);
    });
});
`;
await writeNewFile(categoryTestPath, categoryTestSource, 'audio length category unit test');

// A recorded verdict skips the probe; an unrecorded copy is measured once and recorded.
const verdictTestPath = resolve(root, 'test/unit/onlinePlaybackCachedCopyVerdict.test.ts');
const verdictTestSource = `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cachedAudioMock = vi.hoisted(() => vi.fn());
const recordedLengthMock = vi.hoisted(() => vi.fn(async () => null as 'whole' | 'clip' | 'unproven' | null));
const saveLengthMock = vi.hoisted(() => vi.fn(async () => undefined));
const deleteAudioMock = vi.hoisted(() => vi.fn(async () => true));
const songCacheMock = vi.hoisted(() => vi.fn());
const sourceMock = vi.hoisted(() => vi.fn());
const lyricsMock = vi.hoisted(() => vi.fn());
const otherArtistNameMock = vi.hoisted(() => vi.fn());
const autoMatchMock = vi.hoisted(() => vi.fn());
const prefersOwnWordByWordMock = vi.hoisted(() => vi.fn(() => false));
const loadLyricsStateMock = vi.hoisted(() => vi.fn());
const saveLyricsStateMock = vi.hoisted(() => vi.fn());
const isUrlValidMock = vi.hoisted(() => vi.fn(() => true));
const updatePrefetchedAudioUrlMock = vi.hoisted(() => vi.fn());
const measureMock = vi.hoisted(() => vi.fn());
const lyricSettings = vi.hoisted(() => ({
    autoUseBestLyric: true,
    preferredAlternativeLyricSource: 'qq',
    keepProviderWordTiming: true,
}));

vi.mock('@/services/onlineMusic/resourceCache', () => ({
    deleteCachedSongAudio: deleteAudioMock,
    getCachedSongAudioBlob: cachedAudioMock,
    getCachedSongReplayGain: vi.fn(async () => undefined),
    getRecordedSongAudioLength: recordedLengthMock,
    getSongCacheWithLegacyMigration: songCacheMock,
    saveSongAudioLength: saveLengthMock,
}));

vi.mock('@/services/wholeSongCheck', () => ({
    measureSongAudio: measureMock,
    notTheSongWhy: vi.fn(() => 'shorter than half the song'),
}));

vi.mock('@/services/onlineMusic/omni', () => ({
    omni: {
        getAudioSource: sourceMock,
        getLyrics: lyricsMock,
        getAlternateArtistName: otherArtistNameMock,
        resolveAudioQuality: (_providerId: string, preference: string) => preference,
        isPreviewAudioSource: () => false,
        prefersOwnWordByWordLyrics: prefersOwnWordByWordMock,
    },
}));

afterEach(() => {
    prefersOwnWordByWordMock.mockReturnValue(false);
    lyricSettings.preferredAlternativeLyricSource = 'qq';
    lyricSettings.keepProviderWordTiming = true;
});

vi.mock('@/stores/useLyricSettingsStore', () => ({
    useLyricSettingsStore: {
        getState: () => lyricSettings,
    },
}));

vi.mock('@/utils/lyrics/autoMatchBestLyric', () => ({
    autoMatchBestLyric: autoMatchMock,
}));

// Spread the real module so markOnlineLyricsPureMusic stays real - the shape it writes is the
// thing under test, and a stubbed one would assert nothing.
vi.mock('@/utils/onlineLyricsState', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/utils/onlineLyricsState')>()),
    loadOnlineLyricsState: loadLyricsStateMock,
    resolveOnlineLyrics: (_state: unknown, lyrics: unknown) => lyrics,
    saveOnlineLyricsState: saveLyricsStateMock,
}));

vi.mock('@/services/prefetchService', () => ({
    isUrlValid: isUrlValidMock,
    updatePrefetchedAudioUrl: updatePrefetchedAudioUrlMock,
}));

vi.mock('@/services/db', () => ({
    saveToCache: vi.fn(),
}));

vi.mock('@/utils/blobGuards', () => ({
    createSafeObjectUrl: vi.fn(() => 'blob:test'),
}));

import { loadOnlineSongAudioSource } from '@/services/onlinePlayback';
import type { SongResult } from '@/types';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import { resetOnlineRequestCooldowns } from '@/services/onlineMusic/failure/onlineRequestCooldown';

// test/unit/onlinePlaybackCachedCopyVerdict.test.ts
// A cached song's length verdict, recorded at its write, is trusted at the next play instead of
// decoding the file again (batch 4, item 23). An old copy with no record is measured once and
// recorded then; a copy measured as a clip is deleted and nothing is recorded for it.

const song: SongResult = {
    id: 'online-song',
    name: 'Song',
    artists: [],
    album: { id: 'album', name: 'Album' },
    durationMs: 200_000,
    sourceRef: { kind: 'online', providerId: 'kugou', mediaId: 'online-song' },
};

describe('cached copy length verdict', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        cachedAudioMock.mockResolvedValue(new Blob(['x']));
        recordedLengthMock.mockResolvedValue(null);
        isUrlValidMock.mockReturnValue(true);
        resetOnlineRequestCooldowns();
        useOnlineProviderAccountStore.setState({ accounts: {} });
    });

    it('plays a cached copy with a recorded whole verdict without measuring it again', async () => {
        recordedLengthMock.mockResolvedValue('whole');

        const result = await loadOnlineSongAudioSource(song, 'high', null);

        expect(result).toMatchObject({ kind: 'ok', blobUrl: 'blob:test' });
        expect(measureMock).not.toHaveBeenCalled();
        expect(saveLengthMock).not.toHaveBeenCalled();
    });

    it('measures an unrecorded cached copy once and records the verdict', async () => {
        measureMock.mockResolvedValue({ verdict: 'whole', playLength: 200, statedLength: 200 });

        const result = await loadOnlineSongAudioSource(song, 'high', null);

        expect(result).toMatchObject({ kind: 'ok', blobUrl: 'blob:test' });
        expect(measureMock).toHaveBeenCalledTimes(1);
        expect(saveLengthMock).toHaveBeenCalledWith(song, 'whole');
        expect(deleteAudioMock).not.toHaveBeenCalled();
    });

    it('deletes a cached copy measured as a clip and records nothing for it', async () => {
        measureMock.mockResolvedValue({ verdict: 'clip', playLength: 20, statedLength: 200 });
        sourceMock.mockResolvedValue({ url: 'https://audio.test/song.mp3', fetchedAt: 1, quality: 'high' });

        const result = await loadOnlineSongAudioSource(song, 'high', null);

        expect(result).toMatchObject({ kind: 'ok', audioSrc: 'https://audio.test/song.mp3' });
        expect(deleteAudioMock).toHaveBeenCalledWith(song, 1);
        expect(saveLengthMock).not.toHaveBeenCalled();
    });
});
`;
await writeNewFile(verdictTestPath, verdictTestSource, 'cached copy verdict unit test');

console.log('Applied cached copy verdict: the length proof is recorded once at the write and trusted at play.');
