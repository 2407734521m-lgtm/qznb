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
    if (first < 0) throw new Error('NetEase anon warmup overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('NetEase anon warmup overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// A guest's first song or search paid for an extra round-trip inline: with no cookie stored,
// fetchWithCreds registered the anonymous session before the request it was made for. The
// registration itself is unchanged — it just moves earlier, to an idle slot after the first
// screen, so the first song starts on the request it actually wants. The inline path is kept
// as the fallback for anything that runs before the warmup (or where it failed).

const neteasePath = resolve(root, 'src/services/onlineMusic/netease/netease.ts');
let netease = await read(neteasePath);

netease = replaceOnce(netease,
    `// \`limit\`: the time limit the request gets, which starts when the request is sent: the wait for the
// local backend's port above is not counted. 'sign-in': one of the requests a sign-in waits for, with
// the sign-in's limit; an HTTP error answer to it throws NeteaseLoginHttpError instead of being read as
// an answer. 'online': a song's address or a collection's tracks, with the limit of online requests.`,
    `// Registers the anonymous session the requests below ride on, and stores it. Pulled out of
// fetchWithCreds so the app can warm it up on an idle slot at startup (below): the registration
// is part of the request it is made for, so it gets the same limit there as it did inline.
const ensureAnonymousCookie = async (base: string | null, useOnlineLimit: boolean): Promise<string | null> => {
    if (!base) return null;
    let anonCookie = readProviderSessionValue('netease', 'anonymous_cookie', ['netease_anonymous_cookie']);
    if (!anonCookie) {
        try {
            const register = (signal?: AbortSignal) => fetch(\`\${base}/register/anonimous?timestamp=\${Date.now()}\`, signal ? { signal } : undefined).then(r => r.json());
            const anonRes = await (useOnlineLimit ? withOnlineRequestLimit(register, NETEASE_ONLINE_REQUEST_LIMIT_MS) : register());
            if (anonRes && typeof anonRes.cookie === 'string' && anonRes.cookie) {
                anonCookie = anonRes.cookie;
                writeProviderSessionValue('netease', 'anonymous_cookie', anonRes.cookie);
            }
        } catch (e) {
            console.warn('Failed to fetch anonymous cookie', e);
        }
    }
    return anonCookie;
};

/**
 * Warms the anonymous NetEase session, so a guest's first song or search does not pay the
 * registration round-trip inline. A no-op where a login cookie or an anonymous cookie is already
 * stored, and where the API base is not configured. Never throws: a warmup must not hold up
 * startup, and the inline path in fetchWithCreds still registers on demand where this did not run.
 */
export const warmupNeteaseAnonymousCookie = async (): Promise<void> => {
    try {
        if (readProviderSessionValue('netease', 'cookie', ['netease_cookie'])) return;
        if (readProviderSessionValue('netease', 'anonymous_cookie', ['netease_anonymous_cookie'])) return;
        const base = await getApiBase();
        await ensureAnonymousCookie(base, true);
    } catch (error) {
        console.warn('Failed to warm up NetEase anonymous cookie', error);
    }
};

/** First screen first: the first screen's loading, layout and image decoding go before this. */
const ANON_WARMUP_DELAY_MS = 2500;
/** Still idle after this long: register anyway rather than wait for an idle slot that never comes. */
const ANON_WARMUP_TIMEOUT_MS = 10_000;

let anonWarmupScheduled = false;

/** The warmup above, on an idle slot after the first screen (bootstrap.tsx). Scheduled once, also under StrictMode's double effect. */
export const warmupNeteaseAnonymousCookieWhenIdle = (): void => {
    if (anonWarmupScheduled) return;
    anonWarmupScheduled = true;
    setTimeout(() => {
        const start = () => { void warmupNeteaseAnonymousCookie(); };
        if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(start, { timeout: ANON_WARMUP_TIMEOUT_MS });
        else start();
    }, ANON_WARMUP_DELAY_MS);
};

// \`limit\`: the time limit the request gets, which starts when the request is sent: the wait for the
// local backend's port above is not counted. 'sign-in': one of the requests a sign-in waits for, with
// the sign-in's limit; an HTTP error answer to it throws NeteaseLoginHttpError instead of being read as
// an answer. 'online': a song's address or a collection's tracks, with the limit of online requests.`,
    'anonymous cookie helper and warmup');

netease = replaceOnce(netease,
    `    if (!isLoginOrStatusEndpoint) {
      let anonCookie = readProviderSessionValue('netease', 'anonymous_cookie', ['netease_anonymous_cookie']);
      if (!anonCookie && !endpoint.startsWith('/register/anonimous')) {
        try {
          // The registration is part of the request it is made for: it gets the same limit.
          const register = (signal?: AbortSignal) => fetch(\`\${base}/register/anonimous?timestamp=\${Date.now()}\`, signal ? { signal } : undefined).then(r => r.json());
          const anonRes = await (limit === 'online' ? withOnlineRequestLimit(register, NETEASE_ONLINE_REQUEST_LIMIT_MS) : register());
          if (anonRes && typeof anonRes.cookie === 'string' && anonRes.cookie) {
            anonCookie = anonRes.cookie;
            writeProviderSessionValue('netease', 'anonymous_cookie', anonRes.cookie);
          }
        } catch (e) {
          console.warn('Failed to fetch anonymous cookie', e);
        }
      }
      cookieToUse = anonCookie;
    }`,
    `    if (!isLoginOrStatusEndpoint) {
      // The registration endpoint itself never registers first (it is the registration).
      cookieToUse = endpoint.startsWith('/register/anonimous')
        ? readProviderSessionValue('netease', 'anonymous_cookie', ['netease_anonymous_cookie'])
        : await ensureAnonymousCookie(base, limit === 'online');
    }`,
    'inline registration now calls the helper');

await write(neteasePath, netease);

// The warmup names netease on two lines in bootstrap.tsx; the architecture test pins every
// such place, so the new caller is recorded in its list (platformNamePlaces.ts).
const placesPath = resolve(root, 'test/unit/onlineMusic/platformNamePlaces.ts');
let places = await read(placesPath);
places = replaceOnce(places,
    `    'src/App.tsx': { n: { netease: 6, kugou: 1 }, kind: 'question', why: 'mounts the hook that hands out one platform\\'s account (useNeteaseLibrary); raised by the upstream merge 2026-10-17' },`,
    `    'src/App.tsx': { n: { netease: 6, kugou: 1 }, kind: 'question', why: 'mounts the hook that hands out one platform\\'s account (useNeteaseLibrary); raised by the upstream merge 2026-10-17' },
    'src/bootstrap.tsx': { n: { netease: 2 }, kind: 'question', why: 'warms the anonymous NetEase session on an idle slot after the first screen' },`,
    'bootstrap warmup in the platform name list');
await write(placesPath, places);

// The warmup runs on an idle slot after the first screen, next to the visualizer prewarm.
const bootstrapPath = resolve(root, 'src/bootstrap.tsx');
let bootstrap = await read(bootstrapPath);
bootstrap = replaceOnce(bootstrap,
    `import { prewarmSavedVisualizer, prewarmVisualizersWhenIdle } from './components/visualizer/prewarmVisualizers';`,
    `import { prewarmSavedVisualizer, prewarmVisualizersWhenIdle } from './components/visualizer/prewarmVisualizers';
import { warmupNeteaseAnonymousCookieWhenIdle } from './services/onlineMusic/netease/netease';`,
    'warmup import');
bootstrap = replaceOnce(bootstrap,
    `    React.useEffect(() => {
        noteFoliumFirstScreenMounted();
        prewarmVisualizersWhenIdle();
    }, []);`,
    `    React.useEffect(() => {
        noteFoliumFirstScreenMounted();
        prewarmVisualizersWhenIdle();
        warmupNeteaseAnonymousCookieWhenIdle();
    }, []);`,
    'warmup call');
await write(bootstrapPath, bootstrap);

// The warmup registers only where no cookie is stored, and never throws.
const testPath = resolve(root, 'test/unit/onlineMusic/neteaseAnonWarmup.test.ts');
const testSource = `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warmupNeteaseAnonymousCookie } from '@/services/onlineMusic/netease/netease';

// test/unit/onlineMusic/neteaseAnonWarmup.test.ts
// The anonymous NetEase session is warmed up at startup, so a guest's first song or search does
// not pay the registration round-trip inline. The warmup registers only where no cookie is
// stored, and never throws: the inline path in fetchWithCreds still registers on demand.

describe('netease anonymous cookie warmup', () => {
    const stubStorage = (entries: Record<string, string>) => {
        const store = new Map(Object.entries(entries));
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => { store.set(key, value); },
            removeItem: (key: string) => { store.delete(key); },
            clear: () => store.clear(),
            key: () => null,
            length: 0,
        });
        return store;
    };

    beforeEach(() => {
        vi.stubEnv('VITE_NETEASE_API_BASE', 'http://netease.test');
        vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ cookie: 'anon-cookie' }) } as unknown as Response)));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('registers and stores the anonymous cookie when none is stored', async () => {
        const store = stubStorage({});
        await warmupNeteaseAnonymousCookie();
        expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/register/anonimous');
        expect(store.get('online_provider:netease:anonymous_cookie')).toBe('anon-cookie');
    });

    it('does nothing when a login cookie is already stored', async () => {
        stubStorage({ 'online_provider:netease:cookie': 'login-cookie' });
        await warmupNeteaseAnonymousCookie();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does nothing when an anonymous cookie is already stored', async () => {
        stubStorage({ 'online_provider:netease:anonymous_cookie': 'anon-cookie' });
        await warmupNeteaseAnonymousCookie();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('swallows a failed registration instead of throwing', async () => {
        stubStorage({});
        vi.mocked(fetch).mockRejectedValueOnce(new Error('down'));
        await expect(warmupNeteaseAnonymousCookie()).resolves.toBeUndefined();
    });
});
`;
await writeNewFile(testPath, testSource, 'anonymous warmup unit test');

console.log('Applied NetEase anonymous warmup: registration moves to an idle slot after the first screen.');
