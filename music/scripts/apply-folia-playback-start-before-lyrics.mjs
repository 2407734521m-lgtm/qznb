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
    if (first < 0) throw new Error('Playback start before lyrics overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Playback start before lyrics overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// 1. The deck no longer waits for the lyrics before it starts.
//
// Tapping a song sets the audio source first and loads the lyrics second, but the autoplay
// effect refused to press play while the lyrics were still loading — so a slow lyric fetch
// left a ready, buffered deck sitting silent, and on a bad network that silence was the whole
// experience. The lyrics load in the background and catch up on their own; the deck starts
// as soon as it has a source. `isLyricsLoading` stays in the effect's deps (the effect
// re-runs when the lyrics land, which is a no-op once the intent is spent) but no longer
// gates the start.
const bridgePath = resolve(root, 'src/components/app/playback/bridges/usePlaybackAudioBridge.ts');
let bridge = await read(bridgePath);
bridge = replaceOnce(bridge,
    '            if (shouldAutoPlayRef.current && !isLyricsLoading) {',
    `            // The lyrics are not a precondition for sound: they arrive on their own and the
            // first line catches up, so a slow lyric fetch must not hold a ready deck silent.
            if (shouldAutoPlayRef.current) {`,
    'autoplay lyrics gate');
await write(bridgePath, bridge);

// 2. The two lyric requests run in parallel instead of one after the other.
//
// `getLyrics` fetched the lyric text first and only then asked for the chorus ranges, so a
// song's lyrics cost two round trips in series. The chorus ranges do not depend on the lyric
// text, and fetching them never rejects (a failure resolves to []), so asking for both at
// once cannot fail the lyrics.
const providerPath = resolve(root, 'src/services/onlineMusic/netease/neteaseProvider.ts');
let provider = await read(providerPath);
provider = replaceOnce(provider,
    `        const response = await neteaseApi.getCloudLyric(toNeteaseId(context.userId), toNeteaseId(song.id));
        const mainText = extractCloudLyricText(response);
        const processed = await processNeteaseLyrics({ type: 'netease', lrc: { lyric: mainText } });
        return {
            lyrics: processed.lyrics,
            mainText,
            wordByWordText: null,
            translationText: null,
            romanizationText: null,
            isPureMusic: processed.isPureMusic,
            chorusRanges: await getNeteaseChorusRanges(song.id),
        };`,
    `        // The lyric text and the chorus ranges are independent requests: ask for both at
        // once instead of waiting out the lyric fetch before starting the chorus one.
        const [response, chorusRanges] = await Promise.all([
            neteaseApi.getCloudLyric(toNeteaseId(context.userId), toNeteaseId(song.id)),
            getNeteaseChorusRanges(song.id),
        ]);
        const mainText = extractCloudLyricText(response);
        const processed = await processNeteaseLyrics({ type: 'netease', lrc: { lyric: mainText } });
        return {
            lyrics: processed.lyrics,
            mainText,
            wordByWordText: null,
            translationText: null,
            romanizationText: null,
            isPureMusic: processed.isPureMusic,
            chorusRanges,
        };`,
    'cloud lyrics parallel fetch');
provider = replaceOnce(provider,
    `    const response = await neteaseApi.getLyric(toNeteaseId(song.id));
    const processed = await processNeteaseLyrics(
        typeof neteaseApi.getProcessedLyricPayload === 'function'
            ? neteaseApi.getProcessedLyricPayload(response)
            : response,
    );
    return {
        lyrics: processed.lyrics,
        mainText: processed.mainLrc,
        wordByWordText: processed.yrcLrc,
        translationText: processed.transLrc,
        romanizationText: processed.romanizationLrc,
        isPureMusic: processed.isPureMusic,
        chorusRanges: await getNeteaseChorusRanges(song.id),
    };`,
    `    // Same as the cloud branch above: the chorus ranges do not depend on the lyric text.
    const [response, chorusRanges] = await Promise.all([
        neteaseApi.getLyric(toNeteaseId(song.id)),
        getNeteaseChorusRanges(song.id),
    ]);
    const processed = await processNeteaseLyrics(
        typeof neteaseApi.getProcessedLyricPayload === 'function'
            ? neteaseApi.getProcessedLyricPayload(response)
            : response,
    );
    return {
        lyrics: processed.lyrics,
        mainText: processed.mainLrc,
        wordByWordText: processed.yrcLrc,
        translationText: processed.transLrc,
        romanizationText: processed.romanizationLrc,
        isPureMusic: processed.isPureMusic,
        chorusRanges,
    };`,
    'lyrics parallel fetch');
await write(providerPath, provider);

// 3. A unit test pins the new behaviour: a healthy deck starts even while the lyrics are
// still loading. The same file's harness renders the real bridge with a fake deck, so the
// test fails again if the gate ever comes back.
const testPath = resolve(root, 'test/unit/playback/transcodeAutoplayIntent.test.ts');
let test = await read(testPath);
test = replaceOnce(test,
    `const renderBridge = (deck: ReturnType<typeof createDeck>, shouldAutoPlayRef: { current: boolean }) => {
    playbackState.audioSrc = FAILED_SRC;
    reactHooks.startRender();
    usePlaybackAudioBridge({
        audioRef: { current: deck as unknown as HTMLAudioElement },
        localSongs: [],
        isLyricsLoading: false,`,
    `const renderBridge = (deck: ReturnType<typeof createDeck>, shouldAutoPlayRef: { current: boolean }, isLyricsLoading = false) => {
    playbackState.audioSrc = FAILED_SRC;
    reactHooks.startRender();
    usePlaybackAudioBridge({
        audioRef: { current: deck as unknown as HTMLAudioElement },
        localSongs: [],
        isLyricsLoading,`,
    'renderBridge lyrics flag');
test = replaceOnce(test,
    `    it('still starts a healthy deck', () => {
        const deck = createDeck(null);
        const shouldAutoPlayRef = { current: true };

        renderBridge(deck, shouldAutoPlayRef);

        expect(deck.play).toHaveBeenCalledTimes(1);
        expect(shouldAutoPlayRef.current).toBe(false);
    });
});`,
    `    it('still starts a healthy deck', () => {
        const deck = createDeck(null);
        const shouldAutoPlayRef = { current: true };

        renderBridge(deck, shouldAutoPlayRef);

        expect(deck.play).toHaveBeenCalledTimes(1);
        expect(shouldAutoPlayRef.current).toBe(false);
    });
});

describe('autoplay while the lyrics are still loading', () => {
    beforeEach(() => {
        reactHooks.refs.length = 0;
        setPlayerStateMock.mockClear();
        globalThis.localStorage = { setItem: () => {}, getItem: () => null } as never;
    });

    it('starts the deck instead of waiting for the lyrics to arrive', () => {
        const deck = createDeck(null);
        const shouldAutoPlayRef = { current: true };

        renderBridge(deck, shouldAutoPlayRef, true);

        expect(deck.play).toHaveBeenCalledTimes(1);
        expect(shouldAutoPlayRef.current).toBe(false);
    });
});`,
    'lyrics gate regression test');
await write(testPath, test);

console.log('Applied playback start before lyrics: the deck starts on its source, lyrics load in parallel.');
