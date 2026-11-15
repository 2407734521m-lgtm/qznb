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
    if (first < 0) throw new Error('Online request timeouts overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Online request timeouts overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// 1. One online request may hang for fifteen seconds, not a minute.
//
// The limit was 60 seconds per request, and the failure rules then retried twice more, so a
// dead network could keep the player silent for about two minutes before anything said it
// failed. Fifteen seconds is long enough for a slow-but-alive server and short enough that
// the failure surfaces while the listener is still looking at the player.
const neteasePath = resolve(root, 'src/services/onlineMusic/netease/netease.ts');
let netease = await read(neteasePath);
netease = replaceOnce(netease,
    `// There is no worst case of its own to stay above, so each of the two gets half a minute.
export const NETEASE_ONLINE_REQUEST_LIMIT_MS = 60_000;`,
    `// Fifteen seconds: a request that has not answered by then is not going to, and leaving the
// listener staring at a silent player for a whole minute while it hangs is worse than failing
// fast and saying so.
export const NETEASE_ONLINE_REQUEST_LIMIT_MS = 15_000;`,
    'online request limit');
netease = replaceOnce(netease,
    `  getLyric: async (id: number) => {
    return fetchWithCreds(\`/lyric/new?id=\${id}\`);
  },`,
    `  getLyric: async (id: number) => {
    return fetchWithCreds(\`/lyric/new?id=\${id}\`, {}, 'online');
  },`,
    'getLyric online limit');
netease = replaceOnce(netease,
    `  getChorus: async (id: number) => {
    return fetchWithCreds(\`/song/chorus?id=\${id}\`);
  },`,
    `  getChorus: async (id: number) => {
    return fetchWithCreds(\`/song/chorus?id=\${id}\`, {}, 'online');
  },`,
    'getChorus online limit');
netease = replaceOnce(netease,
    `    const res = await fetchWithCreds(\`/cloudsearch?keywords=\${encodeURIComponent(keywords)}&limit=\${limit}&offset=\${offset}\${typeParam}\`);`,
    `    const res = await fetchWithCreds(\`/cloudsearch?keywords=\${encodeURIComponent(keywords)}&limit=\${limit}&offset=\${offset}\${typeParam}\`, {}, 'online');`,
    'cloudSearch online limit');
await write(neteasePath, netease);

// 2. The automatic retry asks once, after a second — and not at all after a timeout.
//
// A request that timed out already waited out the whole limit; asking again just doubles the
// silence. A plain unreachable gets one retry after a second, which covers a momentary
// dropout without turning a dead network into half a minute of quiet retries.
const failurePath = resolve(root, 'src/services/onlineMusic/failure/onlineFailureCase.ts');
let failure = await read(failurePath);
failure = replaceOnce(failure,
    `/**
 * 要地址的请求连不上时，先自己再要几次，每次之前等这么久；都不行才告诉用的人。到了时限的请求只再要一次：
 * 它已经等过很久了。别的情况再要一次也一样，不自动重来。
 */
export const autoRetryDelaysMs = (shown: OnlineFailure): readonly number[] => (
    shown.case !== 'unreachable' ? [] : shown.facts.timedOut ? [2000] : [1000, 3000]
);`,
    `/**
 * 要地址的请求连不上时，先自己再要一次，等一秒；不行才告诉用的人。到了时限的请求不再要：
 * 它已经等过整个时限了，再等一个时限只是把沉默拖长。别的情况也不自动重来。
 */
export const autoRetryDelaysMs = (shown: OnlineFailure): readonly number[] => (
    shown.case !== 'unreachable' ? [] : shown.facts.timedOut ? [] : [1000]
);`,
    'auto retry delays');
await write(failurePath, failure);

// 3. The tests that pinned the old waits now pin the new ones.
const failureTestPath = resolve(root, 'test/unit/onlineMusic/onlineFailureCase.test.ts');
let failureTest = await read(failureTestPath);
failureTest = replaceOnce(failureTest,
    `    it('asks again by itself only where the platform could not be reached, once where the request ran out of time', () => {
        expect(autoRetryDelaysMs(audio({ case: 'unreachable' }))).toEqual([1000, 3000]);
        expect(autoRetryDelaysMs(audio(undefined, new OnlineRequestTimeout(60_000)))).toEqual([2000]);
        expect(ONLINE_FAILURE_CASE_IDS.filter(id => autoRetryDelaysMs(audio({ case: id })).length > 0)).toEqual(['unreachable']);
    });`,
    `    it('asks again by itself only where the platform could not be reached, once; a request that ran out of time is not asked again', () => {
        expect(autoRetryDelaysMs(audio({ case: 'unreachable' }))).toEqual([1000]);
        expect(autoRetryDelaysMs(audio(undefined, new OnlineRequestTimeout(15_000)))).toEqual([]);
        expect(ONLINE_FAILURE_CASE_IDS.filter(id => autoRetryDelaysMs(audio({ case: id })).length > 0)).toEqual(['unreachable']);
    });`,
    'failure case retry test');
await write(failureTestPath, failureTest);

const qqTestPath = resolve(root, 'test/unit/onlineMusic/qqProvider.test.ts');
let qqTest = await read(qqTestPath);
qqTest = replaceOnce(qqTest,
    '                expect(playerRetries(failure)).toEqual([1000, 3000]);',
    '                expect(playerRetries(failure)).toEqual([1000]);',
    'qq player retries test');
await write(qqTestPath, qqTest);

// 4. A unit test pins the fifteen-second limit at its source, so a later edit that puts the
// minute back fails here instead of silently restoring the two-minute silence.
const limitTestPath = resolve(root, 'test/unit/onlineMusic/neteaseRequestLimit.test.ts');
const limitTestSource = `import { describe, expect, it } from 'vitest';
import { NETEASE_ONLINE_REQUEST_LIMIT_MS } from '../../../src/services/onlineMusic/netease/netease';

// test/unit/onlineMusic/neteaseRequestLimit.test.ts
// A single online request must fail fast instead of leaving the listener staring at a silent
// player: fifteen seconds, then the failure surfaces and the retry rules decide.

describe('netease online request limit', () => {
    it('caps a single online request at fifteen seconds', () => {
        expect(NETEASE_ONLINE_REQUEST_LIMIT_MS).toBe(15_000);
    });
});
`;
await writeNewFile(limitTestPath, limitTestSource, 'netease request limit unit test');

console.log('Applied online request timeouts: fifteen-second limit, one retry, no retry after a timeout.');
