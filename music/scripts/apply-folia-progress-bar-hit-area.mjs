import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, content) => writeFile(path, content, 'utf8');
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Progress bar hit area overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Progress bar hit area overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// The progress bar's hit area was its 6px track: on a phone the thumb is a 12px dot on a
// 6px rail, so dragging to a time meant landing on a wire. The rail itself stays 6px —
// only the invisible range input grows, to a 38px-tall hit zone.
//
// The reach is deliberately lopsided: 10px above the rail, 22px below it. Above the rail sits
// the controls row, one 8px grid gap away, and an invisible input must never cover a button;
// below the rail is only the capsule's own padding and empty page space, and the capsule's
// overflow-hidden clips whatever pokes out anyway. The thumb, invisible until now, shows
// while the bar is hovered, pressed, or keyboard-focused, so a finger can see what it holds.
const barPath = resolve(root, 'src/components/ProgressBar.tsx');
let bar = await read(barPath);
bar = replaceOnce(bar,
    'className="absolute top-1/2 left-0 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 bg-[var(--folium-progress-fill)]"',
    'className="absolute top-1/2 left-0 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100 bg-[var(--folium-progress-fill)]"',
    'progress thumb visibility');
bar = replaceOnce(bar,
    `                <input
                    ref={inputRef}`,
    `                {/* The hit zone is taller than the rail: 10px above it, 22px below it. The top
                    stays shallow so this invisible input never covers the controls row above the
                    8px grid gap; the extra reach goes below, where there is only empty space. */}
                <input
                    ref={inputRef}`,
    'progress hit area comment');
bar = replaceOnce(bar,
    "className={`absolute w-full opacity-0 ${isLine ? 'inset-x-0 -top-1.5 h-[calc(100%+12px)]' : 'inset-0 h-full'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}",
    "className={`absolute w-full opacity-0 ${isLine ? 'inset-x-0 -top-1.5 h-[calc(100%+12px)]' : 'inset-x-0 top-[-10px] bottom-[-22px]'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}",
    'progress input hit area');
await write(barPath, bar);

console.log('Applied progress bar hit area: 38px invisible hit zone on a 6px rail, thumb shows on hover/press/focus.');
