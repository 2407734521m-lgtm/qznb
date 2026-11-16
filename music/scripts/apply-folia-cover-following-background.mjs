import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, content) => writeFile(path, content, 'utf8');

const replaceOnce = (source, needle, replacement, label) => {
    if (source.includes(replacement)) return source;
    const first = source.indexOf(needle);
    if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
        throw new Error('Cover-following background overlay could not find one unambiguous ' + label + ' anchor');
    }
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// Monet already consumes the displayed track's coverUrl, processes it as a full-screen image,
// and crossfades when the song changes. Make that existing cover-derived background the default
// for installations without an explicit saved background preference. Explicit user selections
// remain untouched in localStorage.
const modesPath = resolve(root, 'src/types/visualizerModes.ts');
let modes = await read(modesPath);
modes = replaceOnce(
    modes,
    "export const DEFAULT_VISUALIZER_BACKGROUND_MODE: VisualizerBackgroundMode = 'latent';",
    "export const DEFAULT_VISUALIZER_BACKGROUND_MODE: VisualizerBackgroundMode = 'monet';",
    'default visualizer background mode',
);
await write(modesPath, modes);

// Keep a focused regression test in the pinned upstream checkout so CI verifies the default
// and the Monet tuning remains connected to each song's cover rather than an uploaded image.
const testPath = resolve(root, 'test/unit/visualizer/qianzhiDefaultCoverBackground.test.ts');
const testSource = `import { describe, expect, it } from 'vitest';
import { DEFAULT_MONET_BACKGROUND_TUNING } from '@/types';
import { DEFAULT_VISUALIZER_BACKGROUND_MODE } from '@/types/visualizerModes';

describe('Qianzhi default album-art background', () => {
    it('uses the existing Monet cover-derived background by default', () => {
        expect(DEFAULT_VISUALIZER_BACKGROUND_MODE).toBe('monet');
        expect(DEFAULT_MONET_BACKGROUND_TUNING.backgroundSource).toBe('cover-derived');
        expect(DEFAULT_MONET_BACKGROUND_TUNING.backgroundLayout).toBe('full-overlay');
    });
});
`;

let existingTest = '';
try {
    existingTest = await read(testPath);
} catch (error) {
    if (error?.code !== 'ENOENT') throw error;
}
if (existingTest && existingTest !== testSource) {
    throw new Error('Refusing to overwrite an existing Qianzhi cover-background test.');
}
if (!existingTest) await write(testPath, testSource);

console.log('Applied Qianzhi cover-following background: Monet is the default; explicit saved background choices are preserved.');
