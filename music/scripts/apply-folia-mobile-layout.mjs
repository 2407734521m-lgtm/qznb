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
    if (first < 0) throw new Error('Mobile layout overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Mobile layout overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// A stale camera saved by an earlier build must not open the entire wall outside the phone viewport.
const memoryPath = resolve(root, 'src/library/suites/bravais/bravaisLayoutMemory.ts');
let memory = await read(memoryPath);
const numberAnchor = "const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);";
const cameraGuard = [
    '',
    '// Guard restored camera geometry: a corrupt or obsolete session position can place the full wall',
    '// tens of thousands of CSS pixels away from the viewport. Normal user navigation is unaffected.',
    'const MAX_RESTORED_WORLD_COORDINATE = 32_768;',
    'const isRestorableWorldCoordinate = (value: unknown): value is number => (',
    '    isFiniteNumber(value) && Math.abs(value) <= MAX_RESTORED_WORLD_COORDINATE',
    ');',
].join('\n');
if (!memory.includes('MAX_RESTORED_WORLD_COORDINATE')) memory = replaceOnce(memory, numberAnchor, numberAnchor + cameraGuard, 'camera coordinate guard');
const oldReturn = [
'            center: center && isFiniteNumber(center.x) && isFiniteNumber(center.y) ? { x: center.x, y: center.y } : null,',
'            anchorX: isFiniteNumber(value.anchorX) ? value.anchorX : null,',
'            ...(isFiniteNumber(value.anchorY) ? { anchorY: value.anchorY } : {}),',
'            startSlotKey: asString(value.startSlotKey),',
'            focusSlotKey: asString(value.focusSlotKey),',
].join('\n');
const newReturn = [
'            center: center && isRestorableWorldCoordinate(center.x) && isRestorableWorldCoordinate(center.y) ? { x: center.x, y: center.y } : null,',
'            anchorX: isRestorableWorldCoordinate(value.anchorX) ? value.anchorX : null,',
'            ...(isRestorableWorldCoordinate(value.anchorY) ? { anchorY: value.anchorY } : {}),',
'            // When the camera itself is out of range, discard its related slot pointers too so',
'            // the first mobile render starts from a clean viewport-centered layout.',
'            startSlotKey: center && (',
'                (isFiniteNumber(center.x) && Math.abs(center.x) > MAX_RESTORED_WORLD_COORDINATE)',
'                || (isFiniteNumber(center.y) && Math.abs(center.y) > MAX_RESTORED_WORLD_COORDINATE)',
'            ) ? null : asString(value.startSlotKey),',
'            focusSlotKey: center && (',
'                (isFiniteNumber(center.x) && Math.abs(center.x) > MAX_RESTORED_WORLD_COORDINATE)',
'                || (isFiniteNumber(center.y) && Math.abs(center.y) > MAX_RESTORED_WORLD_COORDINATE)',
'            ) ? null : asString(value.focusSlotKey),',
].join('\n');
if (!memory.includes('discard its related slot pointers')) memory = replaceOnce(memory, oldReturn, newReturn, 'layout memory parser');
await write(memoryPath, memory);

// On an empty library, empty poster frames and a strong grain layer read as broken tiles on narrow screens.
// Keep the Folia wall, but make its empty state a single calm surface with a readable prompt.
const cssPath = resolve(root, 'src/library/suites/bravais/bravais.css');
let css = await read(cssPath);
const cssMarker = '/* Qianzhi mobile empty-wall recovery */';
if (!css.includes(cssMarker)) {
    css += `
\n
${cssMarker}
.bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]),
.bravais-root.is-backdrop-open:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]),
.bravais-root.is-see-through:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]) {
    background:
        radial-gradient(ellipse at 18% 18%, rgba(128, 118, 176, 0.12), transparent 48%),
        radial-gradient(ellipse at 82% 82%, rgba(72, 112, 142, 0.12), transparent 54%),
        linear-gradient(145deg, #111116 0%, #09090d 58%, #121218 100%);
}

.bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"])::after {
    opacity: 0.025;
}

.bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"])::before {
    opacity: 0.18;
}

.bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]) .lattice-poster.bravais-tile-face.is-wall {
    background: transparent;
    box-shadow: none;
}

.bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]) .bravais-wall-hint-title {
    color: color-mix(in srgb, var(--text-primary, #fff) 54%, transparent);
}

.bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]) .bravais-wall-hint-body {
    color: color-mix(in srgb, var(--text-primary, #fff) 66%, transparent);
}

@media (max-width: 640px) {
    .bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]) .bravais-wall-hint {
        padding-top: max(72px, calc(env(safe-area-inset-top) + 52px));
        padding-right: 24px;
        padding-bottom: max(116px, calc(env(safe-area-inset-bottom) + 96px));
        padding-left: 24px;
    }

    .bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]) .bravais-wall-hint-text {
        max-width: 24em;
    }

    .bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]) .bravais-wall-hint-title {
        font-size: clamp(21px, 6vw, 26px);
        line-height: 1.24;
        letter-spacing: 0;
    }

    .bravais-root:has(.bravais-wall-hint[data-bravais-wall-hint="shown"]) .bravais-wall-hint-body {
        max-width: 28em;
        margin-top: 14px;
        font-size: 13px;
        line-height: 1.7;
    }
}
`;
    await write(cssPath, css);
}

// Focused regression test for a stale/corrupt camera record that previously opened the wall off-screen.
const testPath = resolve(root, 'test/unit/library/bravais/bravaisMobileRecovery.test.ts');
const testSource = `import { describe, expect, it } from 'vitest';
import { parseBravaisLayoutRecord } from '@/library/suites/bravais/bravaisLayoutMemory';

describe('Bravais mobile layout recovery', () => {
    it('drops a saved camera far outside the usable wall coordinate range', () => {
        expect(parseBravaisLayoutRecord(JSON.stringify({
            center: { x: 12, y: 96000 },
            anchorX: 200,
            startSlotKey: '12,88,3',
            focusSlotKey: '12,88,4',
        }))).toEqual({
            center: null,
            anchorX: 200,
            startSlotKey: null,
            focusSlotKey: null,
        });
    });

    it('keeps ordinary saved camera positions and their tile pointers', () => {
        expect(parseBravaisLayoutRecord(JSON.stringify({
            center: { x: 1280, y: -3400 },
            anchorX: 136,
            startSlotKey: '1,-2,3',
            focusSlotKey: '1,-2,4',
        }))).toMatchObject({
            center: { x: 1280, y: -3400 },
            anchorX: 136,
            startSlotKey: '1,-2,3',
            focusSlotKey: '1,-2,4',
        });
    });
});
`;
let existingTest = '';
try { existingTest = await read(testPath); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
if (existingTest && existingTest !== testSource) throw new Error('Refusing to overwrite an existing mobile recovery test with different contents.');
if (!existingTest) await write(testPath, testSource);

console.log('Applied Bravais mobile camera recovery and calmer empty-wall styling.');
