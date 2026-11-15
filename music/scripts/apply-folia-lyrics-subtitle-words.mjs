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
    if (first < 0) throw new Error('Lyrics subtitle words overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Lyrics subtitle words overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// The bottom subtitle faded a whole line in at once, while the line's own words carry per-word
// times (real ones for yrc, evenly spread for plain LRC) that only some theme decoration layers
// used. The current row now lights up word by word on the same lyric clock the line itself was
// picked by: a word is dim until its time comes, then full. Only the change of state re-renders
// — the clock moves every frame, but a word flips twice per line at most, the same shape as the
// GlowWord reveal the visualizer modes already use. Lines whose words cannot be placed in the
// text fall back to the whole line, so nothing ever renders less than before.

const overlayPath = resolve(root, 'src/components/visualizer/VisualizerSubtitleOverlay.tsx');
let overlay = await read(overlayPath);
overlay = replaceOnce(overlay,
    `import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Line, SubtitleOverlayLayout, SubtitleOverlayRowSource, Theme } from '../../types';`,
    `import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent } from 'framer-motion';
import { Line, SubtitleOverlayLayout, SubtitleOverlayRowSource, Theme, Word } from '../../types';
import { lyricCurrentTime } from '../../stores/motionSignals';
import { getLineRenderEndTime } from '../../utils/lyrics/renderHints';`,
    'subtitle word imports');
overlay = replaceOnce(overlay,
    `const VisualizerSubtitleOverlay: React.FC<VisualizerSubtitleOverlayProps> = ({`,
    `/** One piece of a subtitle line: a word with its own timing, or the gap between two words. */
export interface SubtitleWordSegment {
    text: string;
    word: Word | null;
}

// Splits a subtitle line's text into its timed words and the gaps between them, so the words can
// light up one by one while the gaps stay put. The words come from the line's own timing — real
// per-word times for yrc, evenly spread for plain LRC — so the walk follows the text in order
// and bails out to the whole line when a word cannot be found where it should be.
export const resolveSubtitleWordSegments = (line: Line, text: string): SubtitleWordSegment[] | null => {
    if (!line.words || line.words.length === 0) return null;
    const segments: SubtitleWordSegment[] = [];
    let cursor = 0;
    for (const word of line.words) {
        if (!word.text) return null;
        const at = text.indexOf(word.text, cursor);
        if (at < 0) return null;
        if (at > cursor) segments.push({ text: text.slice(cursor, at), word: null });
        segments.push({ text: word.text, word });
        cursor = at + word.text.length;
    }
    if (cursor < text.length) segments.push({ text: text.slice(cursor), word: null });
    return segments;
};

// One word of the bottom subtitle: dim until its time comes, then full. Only the change of state
// re-renders — the lyric clock moves every frame, but a word flips twice per line at most, the
// same shape as the GlowWord reveal the visualizer modes already use.
const SubtitleWord: React.FC<{ word: Word; children: React.ReactNode }> = ({ word, children }) => {
    const [revealed, setRevealed] = useState(() => lyricCurrentTime.get() >= word.startTime);
    useMotionValueEvent(lyricCurrentTime, 'change', (latest) => {
        const next = latest >= word.startTime;
        if (next !== revealed) setRevealed(next);
    });
    return (
        <span style={{ opacity: revealed ? 1 : 0.35, transition: 'opacity 120ms linear' }}>
            {children}
        </span>
    );
};

// The current line, word by word; anything the word walk cannot place falls back to the whole line.
const SubtitleCurrentRow: React.FC<{ line: Line; text: string }> = ({ line, text }) => {
    const segments = resolveSubtitleWordSegments(line, text);
    if (!segments) return <>{text}</>;
    return (
        <>
            {segments.map((segment, index) => (
                segment.word ? (
                    <SubtitleWord key={index} word={segment.word}>{segment.text}</SubtitleWord>
                ) : (
                    <span key={index}>{segment.text}</span>
                )
            ))}
        </>
    );
};

// How long the subtitle holds the line just sung through a gap: two seconds, then it lets go so
// a real interlude stops holding the last line. This lives here, in the overlay — the visualizer
// modes read the same line for their own focus, credits and drops, and those keep the old
// never-expire behaviour. The check reads the render end time, the same end the line was picked by.
export const SUBTITLE_RECENT_LINE_RETAIN_SECONDS = 2;

export const isSubtitleRecentLineExpired = (line: Line | null, currentTimeSeconds: number): boolean => {
    if (!line) return false;
    return currentTimeSeconds - getLineRenderEndTime(line) > SUBTITLE_RECENT_LINE_RETAIN_SECONDS;
};

const VisualizerSubtitleOverlay: React.FC<VisualizerSubtitleOverlayProps> = ({`,
    'subtitle word helpers');
overlay = replaceOnce(overlay,
    `    subtitleOverlayLayout,
}) => {
    // 底栏布局全部收在这个 hook 里：它自己判断当前是不是播放页那棵树，
    // 预览和 OBS 走默认值，不受播放页的偏移量和隐藏开关影响。
    const subtitleBottomPx = usePlayerSubtitleBottomPx(Boolean(isPlayerChromeHidden));`,
    `    subtitleOverlayLayout,
}) => {
    // The recent line fades on the lyric clock itself: the overlay only re-renders when the line
    // changes, so without this a gap would hold the last line until the next one starts. Only the
    // subtitle lets go — the modes keep the same line for their own focus, credits and drops.
    const [recentLineExpired, setRecentLineExpired] = useState(false);
    useEffect(() => {
        setRecentLineExpired(false);
    }, [recentCompletedLine]);
    useMotionValueEvent(lyricCurrentTime, 'change', (latest) => {
        const expired = isSubtitleRecentLineExpired(recentCompletedLine, latest);
        if (expired !== recentLineExpired) setRecentLineExpired(expired);
    });
    const visibleRecentLine = recentLineExpired ? null : recentCompletedLine;

    // 底栏布局全部收在这个 hook 里：它自己判断当前是不是播放页那棵树，
    // 预览和 OBS 走默认值，不受播放页的偏移量和隐藏开关影响。
    const subtitleBottomPx = usePlayerSubtitleBottomPx(Boolean(isPlayerChromeHidden));`,
    'subtitle recent line expiry wiring');
overlay = replaceOnce(overlay,
    `    const { shouldRenderOverlay, rows, upcomingLines } = resolveVisualizerSubtitleOverlayContent({
        showText,
        activeLine,
        recentCompletedLine,`,
    `    const { shouldRenderOverlay, rows, upcomingLines } = resolveVisualizerSubtitleOverlayContent({
        showText,
        activeLine,
        recentCompletedLine: visibleRecentLine,`,
    'subtitle visible recent line');
overlay = replaceOnce(overlay,
    "key={`trans-${activeLine?.startTime || recentCompletedLine?.startTime}`}",
    "key={`trans-${activeLine?.startTime || visibleRecentLine?.startTime}`}",
    'subtitle recent line key');
overlay = replaceOnce(overlay,
    `                                            {row.text}
                                        </div>
                                    );
                                })}`,
    `                                            {row.source === 'current' && activeLine ? (
                                                <SubtitleCurrentRow line={activeLine} text={row.text} />
                                            ) : (
                                                row.text
                                            )}
                                        </div>
                                    );
                                })}`,
    'current row word reveal');
await write(overlayPath, overlay);

// The word walk, pinned: words light up in order, gaps stay put, anything unplaceable falls back.
const overlayTestPath = resolve(root, 'test/unit/visualizer/subtitleOverlay.test.ts');
let overlayTest = await read(overlayTestPath);
overlayTest = replaceOnce(overlayTest,
    `import { getUpcomingLyricsClassName, resolveVisualizerSubtitleOverlayContent } from '@/components/visualizer/VisualizerSubtitleOverlay';`,
    `import { getUpcomingLyricsClassName, isSubtitleRecentLineExpired, resolveSubtitleWordSegments, resolveVisualizerSubtitleOverlayContent, SUBTITLE_RECENT_LINE_RETAIN_SECONDS } from '@/components/visualizer/VisualizerSubtitleOverlay';
import { buildLineRenderHints } from '@/utils/lyrics/renderHints';`,
    'subtitle word segments import');
overlayTest = replaceOnce(overlayTest,
    `    it('shows nothing before the first line', () => {
        const content = resolve('current+next', { activeLine: null });

        expect(content.rows).toEqual([]);
        expect(content.upcomingLines).toEqual([]);
    });
});`,
    `    it('shows nothing before the first line', () => {
        const content = resolve('current+next', { activeLine: null });

        expect(content.rows).toEqual([]);
        expect(content.upcomingLines).toEqual([]);
    });
});

describe('resolveSubtitleWordSegments', () => {
    const worded = (words: { text: string; startTime: number; endTime: number }[], fullText: string): Line => ({
        startTime: 0,
        endTime: 10,
        fullText,
        words: words.map(word => ({ ...word })),
    });

    it('splits spaced words and keeps the spaces as gaps', () => {
        const segments = resolveSubtitleWordSegments(
            worded([{ text: 'hello', startTime: 0, endTime: 1 }, { text: 'world', startTime: 1, endTime: 2 }], 'hello world'),
            'hello world',
        );

        expect(segments).toEqual([
            { text: 'hello', word: { text: 'hello', startTime: 0, endTime: 1 } },
            { text: ' ', word: null },
            { text: 'world', word: { text: 'world', startTime: 1, endTime: 2 } },
        ]);
    });

    it('splits CJK lines character by character and keeps trailing punctuation as a gap', () => {
        const segments = resolveSubtitleWordSegments(
            worded([{ text: '你', startTime: 0, endTime: 1 }, { text: '好', startTime: 1, endTime: 2 }], '你好！'),
            '你好！',
        );

        expect(segments).toEqual([
            { text: '你', word: { text: '你', startTime: 0, endTime: 1 } },
            { text: '好', word: { text: '好', startTime: 1, endTime: 2 } },
            { text: '！', word: null },
        ]);
    });

    it('places repeated words in order, not all on the first one', () => {
        const segments = resolveSubtitleWordSegments(
            worded([{ text: 'ha', startTime: 0, endTime: 1 }, { text: 'ha', startTime: 1, endTime: 2 }], 'ha ha'),
            'ha ha',
        );

        expect(segments?.map(segment => segment.text)).toEqual(['ha', ' ', 'ha']);
        expect(segments?.filter(segment => segment.word !== null)).toHaveLength(2);
    });

    it('falls back to the whole line when a word cannot be placed', () => {
        expect(resolveSubtitleWordSegments(worded([{ text: 'missing', startTime: 0, endTime: 1 }], 'other words'), 'other words')).toBeNull();
        expect(resolveSubtitleWordSegments(worded([], 'no words'), 'no words')).toBeNull();
    });
});

describe('isSubtitleRecentLineExpired', () => {
    const line: Line = { startTime: 0, endTime: 5, fullText: 'three', words: [] };
    // The render end is never before the line end; pin the boundary against the computed one.
    const renderEnd = buildLineRenderHints(line).renderEndTime;

    it('keeps the two-second retention', () => {
        expect(SUBTITLE_RECENT_LINE_RETAIN_SECONDS).toBe(2);
    });

    it('holds the line through the retention', () => {
        expect(isSubtitleRecentLineExpired(line, renderEnd)).toBe(false);
        expect(isSubtitleRecentLineExpired(line, renderEnd + 2)).toBe(false);
    });

    it('lets go once the gap outlasts the retention', () => {
        expect(isSubtitleRecentLineExpired(line, renderEnd + 2.01)).toBe(true);
        expect(isSubtitleRecentLineExpired(line, renderEnd + 9)).toBe(true);
    });

    it('never expires without a line', () => {
        expect(isSubtitleRecentLineExpired(null, 99)).toBe(false);
    });
});`,
    'subtitle word segments tests');
await write(overlayTestPath, overlayTest);

console.log('Applied subtitle word reveal: the current row lights up word by word on the lyric clock, with a whole-line fallback.');
