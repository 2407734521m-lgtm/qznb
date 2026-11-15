import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const musicDir = path.resolve(scriptDir, "..");
const foliaDir = path.join(musicDir, "folia");
const controlsPath = path.join(foliaDir, "src/components/FloatingPlayerControls.tsx");
const testPath = path.join(foliaDir, "test/unit/components/playerSwipe.test.ts");

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first === -1) {
    throw new Error(`Folia overlay could not find the expected ${label} anchor. The pinned upstream source may have changed.`);
  }
  if (source.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`Folia overlay found more than one ${label} anchor; refusing an ambiguous patch.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

let source = await fs.readFile(controlsPath, "utf8");

const importLine = "import { resolvePlayerSwipe } from '../../../vendor/lark/src/components/mobile/playerSwipe';";
if (!source.includes(importLine)) {
  const importAnchor = "import { useIsHifiRoute } from './hifi/useHifiSignalPath';";
  source = replaceOnce(source, importAnchor, `${importAnchor}\n${importLine}`, "player swipe import");
}

const gestureRef = "const mobileSwipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);";
if (!source.includes(gestureRef)) {
  const refAnchor = "const touchRevealPressRef = useRef<{ x: number; y: number; } | null>(null);";
  source = replaceOnce(source, refAnchor, `${refAnchor}\n    // Lark-derived gesture state; the seek track and buttons keep their existing touch behavior.\n    ${gestureRef}`, "mobile gesture state");
}

if (!source.includes("const handleMobileSwipeStart =")) {
  const returnAnchor = `    if (hideControlBar) {
        return null;
    }

    return (`;
  const handlers = `    // Mobile gestures reuse Lark's tested direction resolver while keeping Folia's own playback state/UI.
    const handleMobileSwipeStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (
            event.touches.length !== 1
            || controlsDisabled
            || isPositioning
            || isHidden
            || isMorphedIntoPalette
            || isOnSeekTrack(event.target)
            || target?.closest('button, input, textarea, select, [role="slider"]')
        ) {
            mobileSwipeStartRef.current = null;
            return;
        }
        const touch = event.touches[0];
        mobileSwipeStartRef.current = { x: touch.clientX, y: touch.clientY, time: performance.now() };
    }, [controlsDisabled, isHidden, isMorphedIntoPalette, isPositioning]);

    const handleMobileSwipeEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
        const start = mobileSwipeStartRef.current;
        mobileSwipeStartRef.current = null;
        const touch = event.changedTouches[0];
        if (!start || !touch) return;

        const action = resolvePlayerSwipe(
            touch.clientX - start.x,
            touch.clientY - start.y,
            performance.now() - start.time,
        );
        let handled = false;

        if (action === 'previous' && currentView === 'player' && trackNavigation?.canPrev) {
            trackNavigation.onPrev();
            handled = true;
        } else if (action === 'next' && currentView === 'player' && trackNavigation?.canNext) {
            trackNavigation.onNext();
            handled = true;
        } else if (action === 'expand') {
            if (currentView === 'player') {
                revealOnTouch();
                handled = true;
            } else if (currentView === 'home') {
                onNavigateToPlayer();
                handled = true;
            } else if (currentView === 'lattice' && onFocusLatticeCurrentSong) {
                onFocusLatticeCurrentSong();
                handled = true;
            }
        } else if (action === 'collapse' && currentView === 'player' && showExpandedRef.current) {
            endTouchReveal();
            setIsHovered(false);
            if (collapseTimeoutRef.current !== null) {
                window.clearTimeout(collapseTimeoutRef.current);
                collapseTimeoutRef.current = null;
            }
            handled = true;
        }

        // A completed swipe must not also trigger the capsule's click/navigation action.
        if (handled) {
            swallowClickUntilRef.current = performance.now() + TOUCH_STRAY_CLICK_MS;
        }
    }, [currentView, endTouchReveal, onFocusLatticeCurrentSong, onNavigateToPlayer, revealOnTouch, trackNavigation]);

    const handleMobileSwipeCancel = useCallback(() => {
        mobileSwipeStartRef.current = null;
    }, []);

    if (hideControlBar) {
        return null;
    }

    return (`;
  source = replaceOnce(source, returnAnchor, handlers, "mobile gesture handlers");
}

const touchHandlers = `                        onTouchStart={handleMobileSwipeStart}
                        onTouchEnd={handleMobileSwipeEnd}
                        onTouchCancel={handleMobileSwipeCancel}
`;
if (!source.includes("onTouchStart={handleMobileSwipeStart}")) {
  const clickAnchor = "                        onClick={handleClick}\n";
  source = replaceOnce(source, clickAnchor, `${touchHandlers}${clickAnchor}`, "capsule touch handlers");
}

await fs.writeFile(controlsPath, source, "utf8");

// The two customisable capsule slots were 36px (20px icon + 8px padding) and the 500ms
// long-press that swaps them was only discoverable from the title tooltip, which a finger
// never sees. On coarse pointers the hit area grows to 44px, and a small corner mark says
// the slot can be swapped.
const slotButtonPath = path.join(foliaDir, "src/components/floating-player/PlayerControlSlotButton.tsx");
let slotButton = await fs.readFile(slotButtonPath, "utf8");
slotButton = replaceOnce(slotButton,
  "className={`relative select-none rounded-full p-2 transition-colors [-webkit-touch-callout:none] ${stateClass} ${className}`}",
  "className={`relative select-none rounded-full p-2 pointer-coarse:p-3 transition-colors [-webkit-touch-callout:none] ${stateClass} ${className}`}",
  "slot button touch hit area");
slotButton = replaceOnce(slotButton,
  `            <Icon
                size={20}
                className="sm:h-[18px] sm:w-[18px]"
                fill={slot.filled ? 'currentColor' : 'none'}
            />`,
  `            <Icon
                size={20}
                className="sm:h-[18px] sm:w-[18px]"
                fill={slot.filled ? 'currentColor' : 'none'}
            />
            {/* A small corner mark says this slot can be swapped: on touch the long-press hint
                otherwise lives only in the title tooltip, which a finger never sees. */}
            {canCustomize && (
                <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-current opacity-50" />
            )}`,
  "slot button customize marker");
await fs.writeFile(slotButtonPath, slotButton, "utf8");

await fs.mkdir(path.dirname(testPath), { recursive: true });

const testSource = `import { describe, expect, it } from 'vitest';
import { resolvePlayerSwipe } from '../../../../vendor/lark/src/components/mobile/playerSwipe';

describe('Lark mobile player swipe resolver', () => {
    it('maps horizontal swipes to previous and next', () => {
        expect(resolvePlayerSwipe(100, 8, 180)).toBe('previous');
        expect(resolvePlayerSwipe(-100, 8, 180)).toBe('next');
    });

    it('maps vertical swipes to expand and collapse', () => {
        expect(resolvePlayerSwipe(8, -110, 220)).toBe('expand');
        expect(resolvePlayerSwipe(8, 110, 220)).toBe('collapse');
    });

    it('ignores taps, slow short drags and ambiguous diagonals', () => {
        expect(resolvePlayerSwipe(8, 4, 80)).toBeNull();
        expect(resolvePlayerSwipe(50, 0, 1200)).toBeNull();
        expect(resolvePlayerSwipe(60, 50, 180)).toBeNull();
    });

    it('ignores a gesture whose release reverses direction or arrives too late', () => {
        expect(resolvePlayerSwipe(100, 0, 180, { dx: -12, dy: 0, idleMs: 20 })).toBeNull();
        expect(resolvePlayerSwipe(100, 0, 180, { dx: 0, dy: 0, idleMs: 180 })).toBeNull();
    });
});
`;

let existingTest = "";
try {
  existingTest = await fs.readFile(testPath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (existingTest && existingTest !== testSource) {
  throw new Error("The mobile swipe test already exists with different contents; refusing to overwrite it.");
}
if (!existingTest) await fs.writeFile(testPath, testSource, "utf8");

console.log("Applied the Lark-derived mobile swipe overlay to Folia's existing player capsule; capsule slot buttons reach 44px on coarse pointers and carry a swap marker.");
