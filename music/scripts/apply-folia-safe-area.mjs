import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, content) => writeFile(path, content, 'utf8');
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Safe area overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Safe area overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// The app never declared viewport-fit=cover, so on a notched phone the page sits inside the
// safe area instead of under it, and the bottom capsule (32px) and the settings sheet padding
// ignored the home indicator entirely. The viewport now covers, the capsule lifts by the
// bottom inset, and the settings sheet pads by the insets on all four sides. The subtitle
// rides the same bottom stack as the capsule, so it lifts by the same amount on the player
// tree only — previews are scaled boxes, not the viewport, and keep the plain pixel value.

// 27. viewport-fit=cover.
const indexPath = resolve(root, 'index.html');
let index = await read(indexPath);
index = replaceOnce(index,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
    'viewport meta');
await write(indexPath, index);

// 27. Capsule bottom: the shared offset is a plain pixel value, so the safe area is added
// here, on the capsule only, as a calc string.
const controlsPath = resolve(root, 'src/components/FloatingPlayerControls.tsx');
let controls = await read(controlsPath);
controls = replaceOnce(controls,
    "import { AnimatePresence, motion } from 'framer-motion';",
    "import { AnimatePresence, motion, useTransform } from 'framer-motion';",
    'floating controls useTransform import');
controls = replaceOnce(controls,
    '    const bottomBarBottomPx = usePlayerBottomBarBottomPx(capsuleBaseBottomPx);',
    `    const bottomBarBottomPx = usePlayerBottomBarBottomPx(capsuleBaseBottomPx);
    // The capsule clears the home indicator on notched phones: the shared offset is a plain
    // pixel value, so the safe area is added here, on the capsule only, as a calc string.
    const capsuleBottomPx = useTransform(
        bottomBarBottomPx,
        value => \`calc(\${value}px + env(safe-area-inset-bottom))\`,
    );`,
    'capsule safe-area bottom');
controls = replaceOnce(controls,
    '                style={{ bottom: bottomBarBottomPx }}',
    '                style={{ bottom: capsuleBottomPx }}',
    'capsule bottom style');
await write(controlsPath, controls);

// 27. Subtitle bottom: same lift as the capsule, player tree only.
const hookPath = resolve(root, 'src/hooks/usePlayerBottomBarBottomPx.ts');
let hook = await read(hookPath);
hook = replaceOnce(hook,
    `export const usePlayerSubtitleBottomPx = (isPlayerChromeHidden: boolean): MotionValue<number> => {`,
    `export const usePlayerSubtitleBottomPx = (isPlayerChromeHidden: boolean): MotionValue<number> | MotionValue<string> => {`,
    'subtitle bottom return type');
hook = replaceOnce(hook,
    `    return useTransform(
        [controlBarPresence, playerBottomBarLiveOffset, capsuleExpanded],
        ([presence, offset, expanded]: number[]) => resolvePlayerSubtitleBottomFromPresence(
            isBottomBarHost ? offset : previewOffset,
            presence,
            isCompact ? COMPACT_SUBTITLE_GEOMETRY : undefined,
            // 预览里没有底栏，展开量与它无关。
            isBottomBarHost ? expanded * PLAYER_BOTTOM_BAR_EXPANDED_SUBTITLE_EXTRA_PX : 0,
        ),
    );`,
    `    const subtitleBottomPx = useTransform(
        [controlBarPresence, playerBottomBarLiveOffset, capsuleExpanded],
        ([presence, offset, expanded]: number[]) => resolvePlayerSubtitleBottomFromPresence(
            isBottomBarHost ? offset : previewOffset,
            presence,
            isCompact ? COMPACT_SUBTITLE_GEOMETRY : undefined,
            // 预览里没有底栏，展开量与它无关。
            isBottomBarHost ? expanded * PLAYER_BOTTOM_BAR_EXPANDED_SUBTITLE_EXTRA_PX : 0,
        ),
    );
    // On the player tree the subtitle rides the same bottom stack as the capsule, so it
    // clears the home indicator by the same amount; previews are scaled boxes, not the
    // viewport, and keep the plain pixel value.
    const subtitleBottomWithSafeArea = useTransform(
        subtitleBottomPx,
        value => \`calc(\${value}px + env(safe-area-inset-bottom))\`,
    );
    return isBottomBarHost ? subtitleBottomWithSafeArea : subtitleBottomPx;`,
    'subtitle safe-area bottom');
await write(hookPath, hook);

// 27. Settings sheet padding: all four insets, so the sheet never sits under the notch or
// the home indicator. The base sizes stay the same (2rem / 1rem, 3rem / 1.25rem on sm).
const settingsPath = resolve(root, 'src/components/modal/SettingsModal.tsx');
let settings = await read(settingsPath);
settings = replaceOnce(settings,
    'className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8 sm:px-5 sm:py-12"',
    'className="fixed inset-0 z-[100] flex items-center justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))] sm:pt-[max(3rem,env(safe-area-inset-top))] sm:pb-[max(3rem,env(safe-area-inset-bottom))]"',
    'settings sheet safe-area padding');
await write(settingsPath, settings);

console.log('Applied safe areas: viewport-fit=cover, capsule and player subtitle lift by the bottom inset, settings sheet pads by all four insets.');
