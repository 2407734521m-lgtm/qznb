import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, content) => writeFile(path, content, 'utf8');
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Subtitle fade overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Subtitle fade overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// The two-second recent-line retention ended with the text blinking out mid-frame: the row
// vanished the moment the line expired, because the inner motion.div's exit was never wrapped
// in an AnimatePresence of its own. The expiry is now two phases — the row first fades out
// over 300ms, and only then is the line removed — so a gap ends with a fade, not a blink.

// 31. Two-phase expiry: fade, then remove.
const overlayPath = resolve(root, 'src/components/visualizer/VisualizerSubtitleOverlay.tsx');
let overlay = await read(overlayPath);
overlay = replaceOnce(overlay,
    `export const isSubtitleRecentLineExpired = (line: Line | null, currentTimeSeconds: number): boolean => {
    if (!line) return false;
    return currentTimeSeconds - getLineRenderEndTime(line) > SUBTITLE_RECENT_LINE_RETAIN_SECONDS;
};`,
    `export const isSubtitleRecentLineExpired = (line: Line | null, currentTimeSeconds: number): boolean => {
    if (!line) return false;
    return currentTimeSeconds - getLineRenderEndTime(line) > SUBTITLE_RECENT_LINE_RETAIN_SECONDS;
};

/** How long the expired line takes to fade out before it is removed. */
export const SUBTITLE_RECENT_LINE_FADE_MS = 300;

// Two phases: the line first fades (its row animates to opacity 0) and only then is it
// removed, so a gap ends with a fade instead of the text blinking out mid-frame.
export const resolveVisibleRecentLine = (line: Line | null, expired: boolean, gone: boolean): Line | null => (
    expired && gone ? null : line
);`,
    'subtitle fade helpers');
overlay = replaceOnce(overlay,
    `    const [recentLineExpired, setRecentLineExpired] = useState(false);`,
    `    const [recentLineExpired, setRecentLineExpired] = useState(false);
    const [recentLineGone, setRecentLineGone] = useState(false);`,
    'subtitle fade state');
overlay = replaceOnce(overlay,
    `    useEffect(() => {
        setRecentLineExpired(false);
    }, [recentCompletedLine]);`,
    `    useEffect(() => {
        setRecentLineExpired(false);
        setRecentLineGone(false);
    }, [recentCompletedLine]);
    useEffect(() => {
        if (!recentLineExpired) return undefined;
        const timer = window.setTimeout(() => setRecentLineGone(true), SUBTITLE_RECENT_LINE_FADE_MS);
        return () => window.clearTimeout(timer);
    }, [recentLineExpired]);`,
    'subtitle fade timer');
overlay = replaceOnce(overlay,
    `    const visibleRecentLine = recentLineExpired ? null : recentCompletedLine;`,
    `    const visibleRecentLine = resolveVisibleRecentLine(recentCompletedLine, recentLineExpired, recentLineGone);`,
    'subtitle visible recent line');
overlay = replaceOnce(overlay,
    `                            <motion.div
                                key={\`trans-\${activeLine?.startTime || visibleRecentLine?.startTime}\`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="relative z-10 max-w-4xl mx-auto"
                            >`,
    `                            <motion.div
                                key={\`trans-\${activeLine?.startTime || visibleRecentLine?.startTime}\`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: recentLineExpired && !activeLine ? 0 : 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ opacity: { duration: 0.3, ease: 'easeOut' }, y: { duration: 0.24, ease: 'easeOut' } }}
                                className="relative z-10 max-w-4xl mx-auto"
                            >`,
    'subtitle fade animation');
await write(overlayPath, overlay);

// Tests: the two-phase visibility, pinned against the fade length.
const overlayTestPath = resolve(root, 'test/unit/visualizer/subtitleOverlay.test.ts');
let overlayTest = await read(overlayTestPath);
overlayTest = replaceOnce(overlayTest,
    `import { getUpcomingLyricsClassName, isSubtitleRecentLineExpired, resolveSubtitleWordSegments, resolveVisualizerSubtitleOverlayContent, SUBTITLE_RECENT_LINE_RETAIN_SECONDS } from '@/components/visualizer/VisualizerSubtitleOverlay';`,
    `import { getUpcomingLyricsClassName, isSubtitleRecentLineExpired, resolveSubtitleWordSegments, resolveVisibleRecentLine, resolveVisualizerSubtitleOverlayContent, SUBTITLE_RECENT_LINE_FADE_MS, SUBTITLE_RECENT_LINE_RETAIN_SECONDS } from '@/components/visualizer/VisualizerSubtitleOverlay';`,
    'subtitle fade test import');
overlayTest = replaceOnce(overlayTest,
    `    it('never expires without a line', () => {
        expect(isSubtitleRecentLineExpired(null, 99)).toBe(false);
    });
});`,
    `    it('never expires without a line', () => {
        expect(isSubtitleRecentLineExpired(null, 99)).toBe(false);
    });
});

describe('resolveVisibleRecentLine', () => {
    const line: Line = { startTime: 0, endTime: 5, fullText: 'three', words: [] };

    it('fades for 300ms before the line is removed', () => {
        expect(SUBTITLE_RECENT_LINE_FADE_MS).toBe(300);
    });

    it('keeps the line while it is fading', () => {
        expect(resolveVisibleRecentLine(line, true, false)).toBe(line);
    });

    it('removes the line only once the fade is done', () => {
        expect(resolveVisibleRecentLine(line, true, true)).toBeNull();
    });

    it('never removes a line that has not expired', () => {
        expect(resolveVisibleRecentLine(line, false, true)).toBe(line);
        expect(resolveVisibleRecentLine(null, true, true)).toBeNull();
    });
});`,
    'subtitle fade tests');
await write(overlayTestPath, overlayTest);

console.log('Applied subtitle fade: the expired recent line fades out over 300ms before it is removed.');
