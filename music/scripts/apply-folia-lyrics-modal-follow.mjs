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
    if (first < 0) throw new Error('Lyrics modal follow overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Lyrics modal follow overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// The lyric timeline modal followed the song by re-centring on every line change, and it did so
// with the wrong line in gaps and the wrong scroll when the window had been hidden:
// 1. the active line was picked by a forward scan with the raw end time, while the bridge and the
//    visualizers use the shared resolver with the render end time — in a gap the highlight froze
//    on the line that just ended, and the two disagreed at the same timestamp;
// 2. every line change smooth-scrolled, even when the line was already on screen, so on a fast
//    song the list never stopped moving;
// 3. the "this scroll is mine" flag was cleared by a fixed one-second timeout, so a smooth scroll
//    longer than that had its tail read as the listener scrolling and the follow paused for three
//    seconds — and the opening scroll never set the flag at all, so opening the modal paused the
//    follow for three seconds too;
// 4. a jump over several lines (a seek, or the catch-up after the window was hidden) swept past
//    every skipped line instead of landing on the new one.

const modalPath = resolve(root, 'src/components/modal/LyricsTimelineModal.tsx');
let modal = await read(modalPath);

// 1. The same line resolver the bridge and the visualizers use.
modal = replaceOnce(modal,
    `import { LyricData, Theme } from '../../types';`,
    `import { LyricData, Theme } from '../../types';
import { findLatestActiveLineIndex } from '../../utils/appPlaybackHelpers';`,
    'shared line resolver import');

// The two decisions the follow makes, as pure helpers so the unit test can pin them without a
// browser: whether the line is already on screen, and whether the move skipped lines.
modal = replaceOnce(modal,
    `const LyricsTimelineModal: React.FC<LyricsTimelineModalProps> = ({`,
    `// The timeline only scrolls when the active line has left the visible window: on a fast song
// the line changes every second or two, and re-centring each time keeps the list in constant
// motion. A jump over more than one line (a seek, or the catch-up after the window was hidden)
// snaps instead of sweeping past every skipped line.
export const isLyricTimelineLineOutsideView = (
    itemTop: number,
    itemBottom: number,
    viewTop: number,
    viewBottom: number,
): boolean => itemTop < viewTop || itemBottom > viewBottom;

export const isMultiLineLyricJump = (previousIndex: number, nextIndex: number): boolean =>
    previousIndex !== -1 && nextIndex !== -1 && Math.abs(nextIndex - previousIndex) > 1;

const LyricsTimelineModal: React.FC<LyricsTimelineModalProps> = ({`,
    'follow decision helpers');

// The line the auto-scroll last centred on: a jump over more than one line since then is a seek
// or a catch-up after the window was hidden.
modal = replaceOnce(modal,
    `    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isAutoScrolling = useRef(false);`,
    `    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isAutoScrolling = useRef(false);
    const prevLineIndexRef = useRef(-1);
    const openingScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);`,
    'previous line ref');

// In a gap between lines the shared resolver returns -1, so the highlight clears instead of
// freezing on the line that just ended; a line stays active until its render end, as everywhere else.
modal = replaceOnce(modal,
    `    // Track active line
    useMotionValueEvent(currentTime, "change", (latest) => {
        if (!lyrics || !lyrics.lines) return;
        const index = lyrics.lines.findIndex(line => latest >= line.startTime && latest <= line.endTime);
        if (index !== -1 && index !== activeLineIndex) {
            setActiveLineIndex(index);
        }
    });`,
    `    // Track active line, with the same resolver the playback bridge and the visualizers use.
    useMotionValueEvent(currentTime, "change", (latest) => {
        if (!lyrics || !lyrics.lines) return;
        const index = findLatestActiveLineIndex(lyrics.lines, latest);
        if (index !== activeLineIndex) {
            setActiveLineIndex(index);
        }
    });`,
    'shared line resolver');

modal = replaceOnce(modal,
    `    // Reset activeLineIndex when lyrics change (e.g., when switching songs)
    useEffect(() => {
        setActiveLineIndex(-1);
    }, [lyrics]);`,
    `    // Reset activeLineIndex when lyrics change (e.g., when switching songs)
    useEffect(() => {
        setActiveLineIndex(-1);
        prevLineIndexRef.current = -1;
    }, [lyrics]);`,
    'reset previous line on song change');

// The programmatic scroll ends with a scrollend event; that is what clears the auto-scroll flag,
// not a fixed timeout: a smooth scroll longer than the timeout used to have its tail read as the
// listener scrolling, and the follow would pause for three seconds mid-song.
modal = replaceOnce(modal,
    `    // Auto-scroll to active lyric (only when not user scrolling)`,
    `    // The programmatic scroll ends with a scrollend event; that is what clears the
    // auto-scroll flag, not a fixed timeout: a smooth scroll longer than the old timeout had its
    // tail read as the listener scrolling, and the follow would pause for three seconds mid-song.
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return undefined;
        const onScrollEnd = () => {
            isAutoScrolling.current = false;
        };
        container.addEventListener('scrollend', onScrollEnd);
        return () => container.removeEventListener('scrollend', onScrollEnd);
    }, [isOpen]);

    // Auto-scroll to active lyric (only when not user scrolling)`,
    'scrollend listener');

modal = replaceOnce(modal,
    `    // Auto-scroll to active lyric (only when not user scrolling)
    useEffect(() => {
        if (isUserScrolling) return;

        if (activeItemRef.current && scrollContainerRef.current && activeLineIndex !== -1) {
            // Clear any existing timeout
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }

            // Scroll immediately
            const container = scrollContainerRef.current;
            const activeItem = activeItemRef.current;

            if (container && activeItem) {
                const containerHeight = container.clientHeight;
                const itemOffsetTop = activeItem.offsetTop;
                const itemHeight = activeItem.clientHeight;

                // Scroll to center the active item
                const scrollTo = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);

                container.scrollTo({
                    top: scrollTo,
                    behavior: 'smooth'
                });

                // Allow some time for the scroll event to fire and be ignored
                isAutoScrolling.current = true;
                // Add a small timeout to clear the flag in case the scroll event doesn't fire (e.g. already at position)
                setTimeout(() => {
                    isAutoScrolling.current = false;
                }, 1000);
            }
        }

        // Cleanup
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, [activeLineIndex, isUserScrolling]);`,
    `    // Auto-scroll to active lyric (only when not user scrolling, and only when the line has
    // left the visible window: on a fast song the line changes every second or two, and
    // re-centring each time keeps the list in constant motion).
    useEffect(() => {
        // The jump check reads the line before this one even when the listener is scrolling or
        // nothing scrolls, or a later multi-line jump would be measured against a stale line and
        // snap when it should glide. A gap (-1) never overwrites the last real line, so a seek
        // that lands past a gap is still measured against the line before the gap.
        const jumped = isMultiLineLyricJump(prevLineIndexRef.current, activeLineIndex);
        if (activeLineIndex !== -1) {
            prevLineIndexRef.current = activeLineIndex;
        }

        if (isUserScrolling) return;

        if (activeItemRef.current && scrollContainerRef.current && activeLineIndex !== -1) {
            const container = scrollContainerRef.current;
            const activeItem = activeItemRef.current;

            if (container && activeItem) {
                const containerHeight = container.clientHeight;
                const itemOffsetTop = activeItem.offsetTop;
                const itemHeight = activeItem.clientHeight;

                // Already on screen: leave the list where the listener put it.
                if (!isLyricTimelineLineOutsideView(itemOffsetTop, itemOffsetTop + itemHeight, container.scrollTop, container.scrollTop + containerHeight)) {
                    return;
                }

                // Scroll to center the active item. A jump over more than one line (a seek, or
                // the catch-up after the window was hidden) snaps instead of sweeping past every
                // skipped line.
                const scrollTo = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);

                // The scroll event this fires must not read as the listener scrolling: the flag
                // is cleared by scrollend, with a backstop for engines without it and for a
                // scroll that goes nowhere (no scroll event, so no scrollend either).
                isAutoScrolling.current = true;
                if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current);
                }
                scrollTimeoutRef.current = setTimeout(() => {
                    isAutoScrolling.current = false;
                }, 1200);

                container.scrollTo({
                    top: scrollTo,
                    behavior: jumped ? 'auto' : 'smooth'
                });
            }
        }

        // Cleanup
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, [activeLineIndex, isUserScrolling]);`,
    'auto-scroll only when out of view');

modal = replaceOnce(modal,
    `    // Initial scroll when modal opens
    useEffect(() => {
        if (isOpen && activeItemRef.current && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const activeItem = activeItemRef.current;

            setTimeout(() => {
                const containerHeight = container.clientHeight;
                const itemOffsetTop = activeItem.offsetTop;
                const itemHeight = activeItem.clientHeight;

                const scrollTo = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);

                container.scrollTo({
                    top: scrollTo,
                    behavior: 'auto'
                });
            }, 100);
        }
    }, [isOpen]);`,
    `    // Initial scroll when modal opens
    useEffect(() => {
        if (isOpen && activeItemRef.current && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const activeItem = activeItemRef.current;

            openingScrollTimeoutRef.current = setTimeout(() => {
                const containerHeight = container.clientHeight;
                const itemOffsetTop = activeItem.offsetTop;
                const itemHeight = activeItem.clientHeight;

                const scrollTo = itemOffsetTop - (containerHeight / 2) + (itemHeight / 2);

                // This scroll is programmatic too: say so before it fires, or the scroll event
                // reads as the listener scrolling and the follow pauses for three seconds on open.
                // scrollend clears the flag; the backstop covers engines without it.
                isAutoScrolling.current = true;
                if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current);
                }
                scrollTimeoutRef.current = setTimeout(() => {
                    isAutoScrolling.current = false;
                }, 1200);

                container.scrollTo({
                    top: scrollTo,
                    behavior: 'auto'
                });
            }, 100);
        }
        // The opening scroll is 100ms out: if the modal closes before it fires, the timer must
        // not scroll a hidden list and leave a stray backstop behind.
        return () => {
            if (openingScrollTimeoutRef.current) {
                clearTimeout(openingScrollTimeoutRef.current);
            }
        };
    }, [isOpen]);`,
    'initial scroll sets auto-scroll flag');
await write(modalPath, modal);

// The two follow decisions, pinned without a browser.
const followTestPath = resolve(root, 'test/unit/lyrics/lyricTimelineModalFollow.test.ts');
const followTestSource = `import { describe, expect, it } from 'vitest';
import { isLyricTimelineLineOutsideView, isMultiLineLyricJump } from '@/components/modal/LyricsTimelineModal';

// test/unit/lyrics/lyricTimelineModalFollow.test.ts
// The lyric timeline only scrolls when the active line has left the visible window, and a jump
// over more than one line snaps instead of sweeping past every skipped line.

describe('lyric timeline follow decisions', () => {
    it('leaves the list alone while the active line is on screen', () => {
        expect(isLyricTimelineLineOutsideView(100, 140, 0, 400)).toBe(false);
        expect(isLyricTimelineLineOutsideView(0, 40, 0, 400)).toBe(false);
        expect(isLyricTimelineLineOutsideView(360, 400, 0, 400)).toBe(false);
    });

    it('scrolls when the active line is above or below the visible window', () => {
        expect(isLyricTimelineLineOutsideView(-10, 30, 0, 400)).toBe(true);
        expect(isLyricTimelineLineOutsideView(390, 430, 0, 400)).toBe(true);
        expect(isLyricTimelineLineOutsideView(500, 540, 100, 400)).toBe(true);
    });

    it('glides one line at a time, and never on a gap or a fresh song', () => {
        expect(isMultiLineLyricJump(3, 4)).toBe(false);
        expect(isMultiLineLyricJump(4, 3)).toBe(false);
        expect(isMultiLineLyricJump(3, 3)).toBe(false);
        expect(isMultiLineLyricJump(-1, 4)).toBe(false);
        expect(isMultiLineLyricJump(3, -1)).toBe(false);
    });

    it('snaps when the line jumps over more than one line', () => {
        expect(isMultiLineLyricJump(3, 5)).toBe(true);
        expect(isMultiLineLyricJump(8, 2)).toBe(true);
    });
});
`;
await writeNewFile(followTestPath, followTestSource, 'lyric timeline follow unit test');

console.log('Applied lyric timeline follow: shared line resolver, scroll only when out of view, scrollend flag, snap on multi-line jumps.');
