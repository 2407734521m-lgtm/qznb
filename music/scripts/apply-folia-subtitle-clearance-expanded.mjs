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
    if (first < 0) throw new Error('Subtitle clearance overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Subtitle clearance overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// The subtitle sat 112px up, clearing only the collapsed capsule. An expanded capsule is
// about 132px tall with its bottom at 32px, so its top edge is around 164px — and the bottom
// line of lyrics sat right in that covered band. The fix is not a bigger constant: the
// subtitle has to know whether the capsule is open, and stay at 112px when it is not.
//
// The shape of it: FloatingPlayerControls owns the expanded state and writes it into a shared
// motion value; the subtitle hook springs that value (so the subtitle rides the capsule's own
// expand animation) and adds it to the clearance. Previews have no bottom bar, so the extra
// stays zero there.

const signalsPath = resolve(root, 'src/stores/motionSignals.ts');
let signals = await read(signalsPath);
signals = replaceOnce(signals,
    `/** Global bottom baseline offset in px; positioning writes it at pointer-move frequency. */
export const playerBottomBarLiveOffset = motionValue(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX);`,
    `/** Global bottom baseline offset in px; positioning writes it at pointer-move frequency. */
export const playerBottomBarLiveOffset = motionValue(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX);

/**
 * Whether the bottom capsule is expanded (1) or collapsed (0). Written by
 * FloatingPlayerControls, which owns the expanded state; the subtitle reads it so it can
 * clear the tall capsule, not just the baseline.
 */
export const playerBottomBarExpanded = motionValue(0);`,
    'expanded motion value');
await write(signalsPath, signals);

const layoutPath = resolve(root, 'src/utils/playerBottomBarLayout.ts');
let layout = await read(layoutPath);
layout = replaceOnce(layout,
    `/** 展开态胶囊的高度预留（标题行 + 48px 播放按钮行 + 进度行 + p-3），用于算上限。 */
const EXPANDED_CAPSULE_HEIGHT_PX = 132;`,
    `/** 展开态胶囊的高度预留（标题行 + 48px 播放按钮行 + 进度行 + p-3），用于算上限。 */
const EXPANDED_CAPSULE_HEIGHT_PX = 132;

/**
 * 展开时字幕要比折叠态再抬的高度：胶囊顶边在 32 + 132 = 164px，折叠态字幕底距 112px，
 * 164 + 12px 间隙 - 112 = 64。
 */
export const PLAYER_BOTTOM_BAR_EXPANDED_SUBTITLE_EXTRA_PX = 64;`,
    'expanded subtitle extra constant');
layout = replaceOnce(layout,
    `/**
 * 字幕层的 bottom，把「控制条在不在」表达成 0..1 的连续量，好让这一段单独走 spring。
 *
 * 拖动改的是 offsetPx，要跟手；控制条出现/消失改的是 presence，要平滑。
 * 两者混在一个 spring 里的话，拖动会被阻尼拖慢，和另外三个硬跟手的组件脱节。
 *
 * presence 为 1 等同于控制条在场，0 等同于不在场，中间值是过渡中的插值。
 */
export const resolvePlayerSubtitleBottomFromPresence = (
    offsetPx: number,
    controlBarPresence: number,
): number => (
    PLAYER_BOTTOM_BAR_BASE_OFFSET_PX
    + controlBarPresence * (
        (offsetPx - PLAYER_BOTTOM_BAR_BASE_OFFSET_PX) + PLAYER_BOTTOM_BAR_SUBTITLE_CLEARANCE_PX
    )
);`,
    `/**
 * 字幕层的 bottom，把「控制条在不在」表达成 0..1 的连续量，好让这一段单独走 spring。
 *
 * 拖动改的是 offsetPx，要跟手；控制条出现/消失改的是 presence，要平滑。
 * 两者混在一个 spring 里的话，拖动会被阻尼拖慢，和另外三个硬跟手的组件脱节。
 *
 * presence 为 1 等同于控制条在场，0 等同于不在场，中间值是过渡中的插值。
 * expandedExtraPx 是展开态要再抬的高度（0 = 折叠态），同样按 presence 缩放：控制条不在
 * 场时胶囊也不在，字幕回到基线。
 */
export const resolvePlayerSubtitleBottomFromPresence = (
    offsetPx: number,
    controlBarPresence: number,
    expandedExtraPx = 0,
): number => (
    PLAYER_BOTTOM_BAR_BASE_OFFSET_PX
    + controlBarPresence * (
        (offsetPx - PLAYER_BOTTOM_BAR_BASE_OFFSET_PX) + PLAYER_BOTTOM_BAR_SUBTITLE_CLEARANCE_PX + expandedExtraPx
    )
);`,
    'resolve subtitle bottom expanded param');
await write(layoutPath, layout);

const hookPath = resolve(root, 'src/hooks/usePlayerBottomBarBottomPx.ts');
let hook = await read(hookPath);
hook = replaceOnce(hook,
    `import { playerBottomBarLiveOffset } from '../stores/motionSignals';`,
    `import { playerBottomBarExpanded, playerBottomBarLiveOffset } from '../stores/motionSignals';`,
    'hook expanded signal import');
hook = replaceOnce(hook,
    `import {
    PLAYER_BOTTOM_BAR_BASE_OFFSET_PX,
    resolvePlayerBottomComponentBottomPx,
    resolvePlayerSubtitleBottomFromPresence,
} from '../utils/playerBottomBarLayout';`,
    `import {
    PLAYER_BOTTOM_BAR_BASE_OFFSET_PX,
    PLAYER_BOTTOM_BAR_EXPANDED_SUBTITLE_EXTRA_PX,
    resolvePlayerBottomComponentBottomPx,
    resolvePlayerSubtitleBottomFromPresence,
} from '../utils/playerBottomBarLayout';`,
    'hook expanded constant import');
hook = replaceOnce(hook,
    ` * - 控制条出现/消失是离散切换，走 spring，保留原来 animate.bottom 的过渡；
 * - 跟随基线抬高要跟手，直接读共享信号，不经过 spring，否则会落后于其他组件。
 */`,
    ` * - 控制条出现/消失是离散切换，走 spring，保留原来 animate.bottom 的过渡；
 * - 跟随基线抬高要跟手，直接读共享信号，不经过 spring，否则会落后于其他组件；
 * - 胶囊展开/收起也走 spring，和胶囊自己的展开动画同步，字幕始终贴在胶囊顶边之上。
 */`,
    'hook doc comment');
hook = replaceOnce(hook,
    `    const controlBarPresence = useSpring(isControlBarAbsent ? 0 : 1, SUBTITLE_PRESENCE_SPRING);

    useEffect(() => {
        // useSpring 的 set 是「动画到」，不是跳变，所以这里就是那段过渡本身。
        controlBarPresence.set(isControlBarAbsent ? 0 : 1);
    }, [controlBarPresence, isControlBarAbsent]);

    return useTransform(
        [controlBarPresence, playerBottomBarLiveOffset],
        ([presence, offset]: number[]) => resolvePlayerSubtitleBottomFromPresence(
            isBottomBarHost ? offset : previewOffset,
            presence,
        ),
    );`,
    `    const controlBarPresence = useSpring(isControlBarAbsent ? 0 : 1, SUBTITLE_PRESENCE_SPRING);

    useEffect(() => {
        // useSpring 的 set 是「动画到」，不是跳变，所以这里就是那段过渡本身。
        controlBarPresence.set(isControlBarAbsent ? 0 : 1);
    }, [controlBarPresence, isControlBarAbsent]);

    // 展开的胶囊比折叠态高，字幕要跟着抬，否则展开那一下就把最底下一行歌词盖住。
    // 和控制条出现/消失一样走 spring，和胶囊自己的展开动画同步；拖动时的跟手只走 offset，
    // 展开量不经过那条路，所以拖动不会被阻尼拖慢。
    const capsuleExpanded = useSpring(playerBottomBarExpanded.get(), SUBTITLE_PRESENCE_SPRING);

    useEffect(() => playerBottomBarExpanded.on('change', value => capsuleExpanded.set(value)), [capsuleExpanded]);

    return useTransform(
        [controlBarPresence, playerBottomBarLiveOffset, capsuleExpanded],
        ([presence, offset, expanded]: number[]) => resolvePlayerSubtitleBottomFromPresence(
            isBottomBarHost ? offset : previewOffset,
            presence,
            // 预览里没有底栏，展开量与它无关。
            isBottomBarHost ? expanded * PLAYER_BOTTOM_BAR_EXPANDED_SUBTITLE_EXTRA_PX : 0,
        ),
    );`,
    'hook expanded spring');
await write(hookPath, hook);

const controlsPath = resolve(root, 'src/components/FloatingPlayerControls.tsx');
let controls = await read(controlsPath);
controls = replaceOnce(controls,
    `import { playerBottomBarLiveOffset } from '../stores/motionSignals';`,
    `import { playerBottomBarExpanded, playerBottomBarLiveOffset } from '../stores/motionSignals';`,
    'controls expanded signal import');
controls = replaceOnce(controls,
    `    showExpandedRef.current = showExpanded;`,
    `    showExpandedRef.current = showExpanded;

    // 字幕要清开展开的胶囊，而不只是基线：展开量由 usePlayerSubtitleBottomPx 读去、走 spring。
    useEffect(() => {
        playerBottomBarExpanded.set(showExpanded ? 1 : 0);
    }, [showExpanded]);`,
    'controls expanded sync effect');
await write(controlsPath, controls);

// The drag test pinned the old behaviour: during positioning the capsule is expanded, so the
// subtitle now sits 64px higher than the 232px the test asserted. The drag still follows the
// baseline without lag — the extra is a settled spring, so the test waits for it to land.
const specPath = resolve(root, 'test/component/playerBottomBar.spec.ts');
let spec = await read(specPath);
spec = replaceOnce(spec,
    `    test('follows the baseline while dragging, without lagging behind', async ({ page }) => {
        // 抬高量必须跟手：字幕若走 spring 会落后于另外三个组件，看起来不同步
        await enterPositioning(page);
        await dragCapsuleUp(page, 120);
        expect(await subtitleBottom(page)).toBeCloseTo(112 + 120, 0);
    });`,
    `    test('follows the baseline while dragging, without lagging behind', async ({ page }) => {
        // 抬高量必须跟手：字幕若走 spring 会落后于另外三个组件，看起来不同步
        await enterPositioning(page);
        await dragCapsuleUp(page, 120);
        // 定位模式下胶囊是展开的：字幕除了跟抬高量，还要再清开 64px 展开量；展开走 spring，
        // 等它落定再量。拖动本身还是直接跟手，抬高量不经过 spring。
        await expect.poll(() => subtitleBottom(page), { timeout: 3000 }).toBeCloseTo(112 + 120 + 64, 0);
    });

    test('悬停展开胶囊时字幕跟着抬，不被盖住', async ({ page }) => {
        await page.locator(CAPSULE).first().hover();
        await expect.poll(() => subtitleBottom(page), { timeout: 3000 }).toBeCloseTo(112 + 64, 0);
    });`,
    'drag test expanded expectation');
await write(specPath, spec);

// The layout test file already exists upstream: extend its subtitle describe instead of
// replacing it. The new case pins the arithmetic: collapsed 112, expanded 176,
// dragged-and-expanded 296, and the baseline when the control bar is gone.
const layoutTestPath = resolve(root, 'test/unit/utils/playerBottomBarLayout.test.ts');
let layoutTest = await read(layoutTestPath);
layoutTest = replaceOnce(layoutTest,
    `import {
    PLAYER_BOTTOM_BAR_BASE_OFFSET_PX,
    PLAYER_BOTTOM_BAR_SUBTITLE_CLEARANCE_PX,`,
    `import {
    PLAYER_BOTTOM_BAR_BASE_OFFSET_PX,
    PLAYER_BOTTOM_BAR_EXPANDED_SUBTITLE_EXTRA_PX,
    PLAYER_BOTTOM_BAR_SUBTITLE_CLEARANCE_PX,`,
    'layout test expanded constant import');
layoutTest = replaceOnce(layoutTest,
    `    it('stays pinned to the baseline while the bar is absent, whatever the offset', () => {
        expect(resolvePlayerSubtitleBottomFromPresence(300, 0)).toBe(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX);
    });
});`,
    `    it('stays pinned to the baseline while the bar is absent, whatever the offset', () => {
        expect(resolvePlayerSubtitleBottomFromPresence(300, 0)).toBe(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX);
    });

    it('lifts by the expanded extra while the capsule is open, and not when it is shut', () => {
        expect(PLAYER_BOTTOM_BAR_EXPANDED_SUBTITLE_EXTRA_PX).toBe(64);
        expect(resolvePlayerSubtitleBottomFromPresence(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, 1, 64)).toBe(176);
        expect(resolvePlayerSubtitleBottomFromPresence(152, 1, 64)).toBe(296);
        expect(resolvePlayerSubtitleBottomFromPresence(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, 0, 64)).toBe(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX);
        expect(resolvePlayerSubtitleBottomFromPresence(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, 0.5, 64)).toBe(104);
    });
});`,
    'layout test expanded extra case');
await write(layoutTestPath, layoutTest);

console.log('Applied subtitle clearance for the expanded capsule: subtitle lifts 64px while the capsule is open.');
