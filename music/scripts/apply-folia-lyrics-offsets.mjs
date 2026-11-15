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
    if (first < 0) throw new Error('Lyrics offsets overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Lyrics offsets overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// Three offset limits that were too small to be useful:
// 1. The global lyric offset stopped at ±2000ms, and some songs are off by more than that —
//    at the limit the words still sat ahead of (or behind) the sound. Five seconds now. The
//    calibration ruler reads the same constant, so its scale follows without a second edit.
// 2. The per-song offset stepped 250ms per press, while an ear hears about 100ms: nudging to
//    the right value meant overshooting, then coming back. Fifty milliseconds now.
// 3. getCloudLyric (the cloud-drive lyrics branch) never passed the online limit to its request,
//    so a dead network could hang it without a timeout — the one batch-1 leftover: getLyric,
//    getChorus and cloudSearch got the limit there, this one did not.

// 1. The global offset limit: two seconds become five.
const settingsPath = resolve(root, 'src/stores/useLyricSettingsStore.ts');
let settings = await read(settingsPath);
settings = replaceOnce(settings,
    `// Device-local audio/visual latency compensation (Bluetooth headphones and the like). Deliberately
// NOT part of the synced visual config: the right value belongs to this machine's output path.
export const GLOBAL_LYRIC_TIMELINE_OFFSET_LIMIT_MS = 2000;`,
    `// Device-local audio/visual latency compensation (Bluetooth headphones and the like). Deliberately
// NOT part of the synced visual config: the right value belongs to this machine's output path.
// Five seconds: some songs are off by more than two, and the old limit left those unfixable.
export const GLOBAL_LYRIC_TIMELINE_OFFSET_LIMIT_MS = 5000;`,
    'global lyric offset limit');
await write(settingsPath, settings);

// The five-second limit, pinned next to the clamp tests.
const offsetTestPath = resolve(root, 'test/unit/stores/globalLyricTimelineOffset.test.ts');
let offsetTest = await read(offsetTestPath);
offsetTest = replaceOnce(offsetTest,
    `    it('bounds the value on both sides', () => {
        expect(clampGlobalLyricTimelineOffsetMs(999999)).toBe(GLOBAL_LYRIC_TIMELINE_OFFSET_LIMIT_MS);
        expect(clampGlobalLyricTimelineOffsetMs(-999999)).toBe(-GLOBAL_LYRIC_TIMELINE_OFFSET_LIMIT_MS);
    });`,
    `    it('bounds the value on both sides', () => {
        expect(clampGlobalLyricTimelineOffsetMs(999999)).toBe(GLOBAL_LYRIC_TIMELINE_OFFSET_LIMIT_MS);
        expect(clampGlobalLyricTimelineOffsetMs(-999999)).toBe(-GLOBAL_LYRIC_TIMELINE_OFFSET_LIMIT_MS);
    });

    it('allows up to five seconds each way for songs that are further off', () => {
        expect(GLOBAL_LYRIC_TIMELINE_OFFSET_LIMIT_MS).toBe(5000);
        expect(clampGlobalLyricTimelineOffsetMs(4000)).toBe(4000);
        expect(clampGlobalLyricTimelineOffsetMs(-4000)).toBe(-4000);
    });`,
    'five second limit test');
await write(offsetTestPath, offsetTest);

// 2. The per-song offset steps 50ms per press, not 250.
const controlPath = resolve(root, 'src/components/panelTab/LyricTimelineOffsetControl.tsx');
let control = await read(controlPath);
control = replaceOnce(control,
    `// src/components/panelTab/LyricTimelineOffsetControl.tsx
// One row of the song's tab: how many milliseconds the playing song's lyrics are moved, in steps of
// 250 or typed, and a button that puts it back to 0.`,
    `// src/components/panelTab/LyricTimelineOffsetControl.tsx
// One row of the song's tab: how many milliseconds the playing song's lyrics are moved, in steps of
// 50 or typed, and a button that puts it back to 0.`,
    'per-song offset comment');
control = replaceOnce(control,
    `const STEP_MS = 250;`,
    `// Fifty milliseconds a press: an ear hears about a hundred, so a 250ms step always overshot
// the value it was nudging towards. Exported so the unit test can pin it.
export const LYRIC_TIMELINE_OFFSET_STEP_MS = 50;`,
    'per-song offset step');
control = replaceOnce(control,
    `                step={STEP_MS}`,
    `                step={LYRIC_TIMELINE_OFFSET_STEP_MS}`,
    'per-song offset step usage');
await write(controlPath, control);

const stepTestPath = resolve(root, 'test/unit/lyrics/lyricTimelineOffsetStep.test.ts');
const stepTestSource = `import { describe, expect, it } from 'vitest';
import { LYRIC_TIMELINE_OFFSET_STEP_MS } from '@/components/panelTab/LyricTimelineOffsetControl';

// test/unit/lyrics/lyricTimelineOffsetStep.test.ts
// The per-song lyric offset steps 50ms per press: an ear hears about 100ms, so a 250ms step
// always overshot the value it was nudging towards.

describe('per-song lyric offset step', () => {
    it('steps 50ms per press', () => {
        expect(LYRIC_TIMELINE_OFFSET_STEP_MS).toBe(50);
    });
});
`;
await writeNewFile(stepTestPath, stepTestSource, 'per-song offset step unit test');

// 3. The cloud-drive lyrics request gets the online limit, like the other lyric requests.
const neteasePath = resolve(root, 'src/services/onlineMusic/netease/netease.ts');
let netease = await read(neteasePath);
netease = replaceOnce(netease,
    `  getCloudLyric: async (uid: number, sid: number) => {
    return fetchWithCreds(\`/cloud/lyric/get?uid=\${uid}&sid=\${sid}\`);
  },`,
    `  getCloudLyric: async (uid: number, sid: number) => {
    return fetchWithCreds(\`/cloud/lyric/get?uid=\${uid}&sid=\${sid}\`, {}, 'online');
  },`,
    'getCloudLyric online limit');
await write(neteasePath, netease);

// The cloud-drive lyrics request fails fast on a dead network: with a hanging fetch it must
// reject with the online timeout once the fifteen-second limit passes, instead of hanging.
// The stored cookie skips the anonymous registration, so the one request in flight is the lyrics
// request itself.
const cloudLyricTestPath = resolve(root, 'test/unit/onlineMusic/neteaseCloudLyricLimit.test.ts');
const cloudLyricTestSource = `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETEASE_ONLINE_REQUEST_LIMIT_MS, neteaseApi } from '@/services/onlineMusic/netease/netease';
import { OnlineRequestTimeout } from '@/services/onlineMusic/failure/onlineRequestLimit';

// test/unit/onlineMusic/neteaseCloudLyricLimit.test.ts
// The cloud-drive lyrics request rides the online limit like the other lyric requests: on a dead
// network it rejects with the online timeout once the limit passes, instead of hanging silently.

describe('netease getCloudLyric online limit', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubEnv('VITE_NETEASE_API_BASE', 'http://netease.test');
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => (key === 'online_provider:netease:cookie' ? 'test-cookie' : null),
            setItem: () => undefined,
            removeItem: () => undefined,
            clear: () => undefined,
            key: () => null,
            length: 0,
        });
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('asks the cloud lyrics endpoint under the online limit', async () => {
        const promise = neteaseApi.getCloudLyric(1, 2);
        const assertion = expect(promise).rejects.toBeInstanceOf(OnlineRequestTimeout);
        await vi.advanceTimersByTimeAsync(NETEASE_ONLINE_REQUEST_LIMIT_MS);
        await assertion;
        expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/cloud/lyric/get?uid=1&sid=2');
    });
});
`;
await writeNewFile(cloudLyricTestPath, cloudLyricTestSource, 'cloud lyric online limit unit test');

console.log('Applied lyrics offsets: global limit five seconds, per-song step 50ms, cloud lyrics under the online limit.');
