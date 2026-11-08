import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, content) => writeFile(path, content, 'utf8');
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Player polish overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Player polish overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// The latent background's 4x4 dithering layer is Folia's signature texture, but at the upstream
// defaults (2.5px dots, 0.55 opacity plus a bass boost) it reads as heavy pixel grain over the
// whole stage on a phone screen (user report, 2026-11-08). A first softening pass shipped and a
// live check still found the dot grid clearly visible on light covers, so the scales below are
// stronger. Two places:
//   1. New defaults for fresh installs: finer dots, lower base opacity.
//   2. A render-level scale inside LatentBackground, so an appearance config saved with the old
//      defaults softens too - the stored values stay untouched and the settings sliders keep
//      working relative to them (a user can still crank the grain back up).

// 1. Defaults in src/types.ts (DEFAULT_LATENT_BACKGROUND_TUNING).
const typesPath = resolve(root, 'src/types.ts');
let types = await read(typesPath);
if (!types.includes('ditheringSize: 1.6,')) {
    types = replaceOnce(types, 'ditheringSize: 2.5,', 'ditheringSize: 1.6,', 'default dithering size');
}
if (!types.includes('ditheringOpacity: 0.3,')) {
    types = replaceOnce(types, 'ditheringOpacity: 0.55,', 'ditheringOpacity: 0.3,', 'default dithering opacity');
}
await write(typesPath, types);

// 2. Render-level softening in LatentBackground.tsx.
const latentPath = resolve(root, 'src/components/visualizer/backgrounds/latent/LatentBackground.tsx');
let latent = await read(latentPath);
const sizeScaleMarker = 'tuning.ditheringSize * 0.6';
if (!latent.includes(sizeScaleMarker)) {
    latent = replaceOnce(
        latent,
        'size={tuning.ditheringSize}',
        'size={tuning.ditheringSize * 0.6}',
        'dithering shader size',
    );
    latent = replaceOnce(
        latent,
        'u_pxSize: Math.max(0.5, tuning.ditheringSize - smoothedBass * tuning.ditheringSize * 0.34),',
        'u_pxSize: Math.max(0.5, (tuning.ditheringSize - smoothedBass * tuning.ditheringSize * 0.34) * 0.6),',
        'dithering frame-loop pixel size',
    );
}
const opacityScaleMarker = 'tuning.ditheringOpacity * 0.5';
if (!latent.includes(opacityScaleMarker)) {
    latent = replaceOnce(
        latent,
        'opacity: showMesh ? tuning.ditheringOpacity : 1,',
        'opacity: showMesh ? tuning.ditheringOpacity * 0.5 : 1,',
        'dithering initial layer opacity',
    );
    latent = replaceOnce(
        latent,
        '`${Math.min(1, tuning.ditheringOpacity + smoothedBass * 0.25)}`',
        '`${Math.min(1, (tuning.ditheringOpacity + smoothedBass * 0.25) * 0.5)}`',
        'dithering frame-loop layer opacity',
    );
}
await write(latentPath, latent);

console.log('Applied Qianzhi player polish: softer latent dithering (defaults 1.6px / 0.30, render scale 0.6 / 0.5).');
