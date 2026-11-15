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
    if (first < 0) throw new Error('Lyrics stage timing overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Lyrics stage timing overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// A pure-lyrics stage session read its lines against the raw synthetic clock: the global and
// per-song offsets never applied, so the words sat ahead of (or behind) the sound by the offset,
// and the lyric clock never moved at all. Every other branch already subtracts the offset and
// reports the lyric time; the stage branch now does the same. (The two-second hold on the recent
// line lives in the subtitle overlay itself, not in the shared runtime: the visualizer modes read
// the same line for their own focus, credits and drops, and those keep the old behaviour.)

// The stage branch takes the offset, like every other branch.
const bridgePath = resolve(root, 'src/components/app/playback/bridges/usePlaybackVisualizerBridge.ts');
let bridge = await read(bridgePath);
bridge = replaceOnce(bridge,
    `        } else if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && stageLyricsSession) {
            // A session without lyrics (an external player's track whose lyrics are not found) still keeps time.
            const nextTime = getSyntheticStageLyricsTime();
            const clock = stageLyricsClockRef.current;
            const hasReachedEnd = playerState === PlayerState.PLAYING && nextTime >= clock.endTimeSec;

            currentTime.set(nextTime);

            showLine(lyrics ? findLatestActiveLineIndex(lyrics.lines, nextTime) : -1);`,
    `        } else if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && stageLyricsSession) {
            // A session without lyrics (an external player's track whose lyrics are not found) still keeps time.
            const nextTime = getSyntheticStageLyricsTime();
            const clock = stageLyricsClockRef.current;
            const hasReachedEnd = playerState === PlayerState.PLAYING && nextTime >= clock.endTimeSec;

            currentTime.set(nextTime);

            // A pure-lyrics session still takes the same global/per-song offset as every other
            // path: without it the words sit ahead of (or behind) the sound by the offset, and
            // the lyric clock never moves, so nothing downstream can read the offset time.
            const effectiveLyricTime = nextTime - displayOffsetMsRef.current / 1000;
            showLyricTime(effectiveLyricTime);
            showLine(lyrics ? findLatestActiveLineIndex(lyrics.lines, effectiveLyricTime) : -1);`,
    'stage branch offset lyric time');
await write(bridgePath, bridge);

console.log('Applied lyrics stage timing: stage branch takes the offset and reports lyric time.');
