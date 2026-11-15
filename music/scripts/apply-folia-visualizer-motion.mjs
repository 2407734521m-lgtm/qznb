import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, content) => writeFile(path, content, 'utf8');
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Visualizer motion overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Visualizer motion overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// 17. Switching lyric styles or backgrounds ran the full-screen soft-focus blur on every
// frame of the change, with no automatic downgrade on phones. Phones now get the same switch
// with opacity only — the timings are unchanged, the blur and the scale are gone. This is
// scoped to the VisualizerRenderer transition only; uiMicroMotion is deliberately not added
// to the auto-reduce list, because that switch is the user's own setting, not the system's.
const softFocusPath = resolve(root, 'src/components/visualizer/styleTransition/softFocus.ts');
let softFocus = await read(softFocusPath);
softFocus = replaceOnce(softFocus,
    `export default softFocus;`,
    `export default softFocus;

// The same switch without the blur and the scale: on phones the full-screen blur is a filter
// pass over the whole stage on every frame of the change, so the change is opacity only.
export const softFocusOpacityOnly: LayerTransition = {
    leave: {
        to: { opacity: 0 },
        duration: 360,
        easing: 'cubic-bezier(0.4, 0, 1, 1)',
    },
    enter: {
        from: { opacity: 0 },
        delay: 80,
        duration: 520,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
};`,
    'opacity-only soft focus');
await write(softFocusPath, softFocus);

const rendererPath = resolve(root, 'src/components/visualizer/VisualizerRenderer.tsx');
let renderer = await read(rendererPath);
renderer = replaceOnce(renderer,
    "import softFocus from './styleTransition/softFocus';",
    "import softFocus, { softFocusOpacityOnly } from './styleTransition/softFocus';",
    'soft focus opacity import');
renderer = replaceOnce(renderer,
    "import { useReducedMotionFor } from '../../hooks/useReducedMotionFor';",
    "import { useReducedMotionFor } from '../../hooks/useReducedMotionFor';\nimport { resolveQianzhiPerformanceProfile } from '../../utils/qianzhiPerformance';",
    'performance profile import');
renderer = replaceOnce(renderer,
    "    const transition = animateStyleSwitch && !resolvedProps.staticMode && !reducedMotion ? softFocus : null;",
    `    // Phones get the same switch with opacity only: the full-screen blur costs a filter
    // pass over the whole stage on every frame of the change. The auto-reduce list
    // deliberately does not cover uiMicroMotion — that switch is the user's own setting.
    const qianzhiStyleTransition = resolveQianzhiPerformanceProfile().reduceComplexMotion ? softFocusOpacityOnly : softFocus;
    const transition = animateStyleSwitch && !resolvedProps.staticMode && !reducedMotion ? qianzhiStyleTransition : null;`,
    'opacity-only transition choice');
await write(rendererPath, renderer);

// 24. The bottom capsule ran two layout springs on the same morph — one on the shell, one on
// the content box inside it — plus a full backdrop blur. Only the shell keeps its layout
// spring now; the inner box is w-full, so it follows the shell's animated size on its own.
const controlsPath = resolve(root, 'src/components/FloatingPlayerControls.tsx');
let controls = await read(controlsPath);
controls = replaceOnce(controls,
    `                        <motion.div
                            layout
                            transition={{ layout: CONTROL_LAYOUT_SPRING }}
                            // 定位模式下 seek 和所有按钮一起失效：这时胶囊是个被拖的物体，不是控件。`,
    `                        <motion.div
                            // Only the capsule shell animates its layout: a second layout spring
                            // on this inner box ran on the same morph and doubled the work.
                            // 定位模式下 seek 和所有按钮一起失效：这时胶囊是个被拖的物体，不是控件。`,
    'capsule inner layout spring');
await write(controlsPath, controls);

// Tests: the opacity-only transition keeps the softFocus timings and drops blur/scale.
const testPath = resolve(root, 'test/unit/visualizer/softFocusOpacityOnly.test.ts');
const testSource = `import { describe, expect, it } from 'vitest';
import softFocus, { softFocusOpacityOnly } from '@/components/visualizer/styleTransition/softFocus';

describe('softFocusOpacityOnly', () => {
    it('keeps the softFocus timings but drops the blur and scale', () => {
        expect(softFocusOpacityOnly.leave.to).toEqual({ opacity: 0 });
        expect(softFocusOpacityOnly.enter.from).toEqual({ opacity: 0 });
        expect(softFocusOpacityOnly.leave.duration).toBe(softFocus.leave.duration);
        expect(softFocusOpacityOnly.enter.duration).toBe(softFocus.enter.duration);
        expect(softFocusOpacityOnly.enter.delay).toBe(softFocus.enter.delay);
    });
});
`;
let existingTest = '';
try { existingTest = await read(testPath); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
if (existingTest && existingTest !== testSource) {
    throw new Error('Refusing to overwrite an existing softFocus opacity test.');
}
if (!existingTest) await write(testPath, testSource);

console.log('Applied visualizer motion: phones switch styles with opacity only, capsule keeps a single layout spring.');
