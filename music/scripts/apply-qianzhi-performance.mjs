import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, content) => writeFile(path, content, 'utf8');

const replaceOnce = (source, needle, replacement, label) => {
    if (source.includes(replacement)) return source;
    const first = source.indexOf(needle);
    if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
        throw new Error('Qianzhi performance overlay could not find one unambiguous ' + label + ' anchor');
    }
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

const replaceAll = (source, needle, replacement, label) => {
    if (source.includes(replacement)) return source;
    if (!source.includes(needle)) throw new Error('Qianzhi performance overlay could not find ' + label + ' anchor');
    return source.split(needle).join(replacement);
};

const profilePath = resolve(root, 'src/utils/qianzhiPerformance.ts');
const profileSource = `export type QianzhiPerformanceHints = {
    isMobile?: boolean;
    deviceMemory?: number;
    hardwareConcurrency?: number;
    saveData?: boolean;
    effectiveType?: string;
};

export type QianzhiPerformanceProfile = {
    coverSize: 512 | 1024;
    freezeAnimatedBackground: boolean;
    preloadConcurrency: 1 | 2;
    preloadNeighborRadius: number;
    initialPreloadCount: number;
    networkConstrained: boolean;
};

/** Reads browser hints without requiring experimental Navigator fields to exist on every browser. */
export const readQianzhiPerformanceHints = (): QianzhiPerformanceHints => {
    if (typeof navigator === 'undefined') return {};
    const extendedNavigator = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { saveData?: boolean; effectiveType?: string };
    };
    const userAgentIsMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const narrowViewport = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 820px)').matches;
    const narrowTouchViewport = typeof window !== 'undefined'
        && navigator.maxTouchPoints > 0
        && window.innerWidth <= 1024;

    return {
        isMobile: userAgentIsMobile || narrowViewport || narrowTouchViewport,
        deviceMemory: extendedNavigator.deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
        saveData: extendedNavigator.connection?.saveData,
        effectiveType: extendedNavigator.connection?.effectiveType,
    };
};

/**
 * Keeps the audio and lyric renderer intact while adapting decorative work and image traffic
 * to the device. On phones only the animated *background layer* is settled; lyric rendering,
 * transport controls and the audio pipeline continue normally.
 */
export const resolveQianzhiPerformanceProfile = (
    hints: QianzhiPerformanceHints = readQianzhiPerformanceHints(),
): QianzhiPerformanceProfile => {
    const networkConstrained = hints.saveData === true
        || ['slow-2g', '2g', '3g'].includes((hints.effectiveType ?? '').toLowerCase());
    const lowMemory = hints.deviceMemory !== undefined && hints.deviceMemory <= 4;
    const lowCpu = hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4;
    const constrained = networkConstrained || lowMemory || lowCpu;
    const mobile = hints.isMobile === true;
    const balanced = mobile || constrained;

    return {
        coverSize: mobile || networkConstrained ? 512 : 1024,
        freezeAnimatedBackground: mobile || constrained,
        preloadConcurrency: balanced ? 1 : 2,
        preloadNeighborRadius: networkConstrained ? 3 : balanced ? 6 : 12,
        initialPreloadCount: networkConstrained ? 4 : balanced ? 8 : 24,
        networkConstrained,
    };
};
`;

let profile = '';
try { profile = await read(profilePath); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
if (profile && profile !== profileSource) throw new Error('Refusing to overwrite an existing Qianzhi performance profile.');
if (!profile) await writeFile(profilePath, profileSource, 'utf8');

const backdropPath = resolve(root, 'src/components/visualizer/VisualizerBackdrop.tsx');
let backdrop = await read(backdropPath);
backdrop = replaceOnce(
    backdrop,
    "import { getSizedCoverUrl } from '../../utils/coverUrl';",
    "import { getSizedCoverUrl } from '../../utils/coverUrl';\nimport { resolveQianzhiPerformanceProfile } from '../../utils/qianzhiPerformance';",
    'visualizer backdrop profile import',
);
backdrop = replaceOnce(
    backdrop,
    'const paused = sharedProps?.paused ?? false;',
    'const paused = sharedProps?.paused ?? false;\n    const coverSize = resolveQianzhiPerformanceProfile().coverSize;',
    'visualizer backdrop cover size',
);
backdrop = replaceOnce(
    backdrop,
    'coverUrl: getSizedCoverUrl(sharedProps?.coverUrl, 1024) || undefined,',
    'coverUrl: getSizedCoverUrl(sharedProps?.coverUrl, coverSize) || undefined,',
    'visualizer backdrop cover request',
);
await write(backdropPath, backdrop);

const modelPath = resolve(root, 'src/components/visualizer/useVisualizerRendererModel.ts');
let model = await read(modelPath);
model = replaceOnce(
    model,
    "import { useBackgroundLyricHoldStore } from '../app/backgroundThrottling/backgroundLyricHoldStore';",
    "import { useBackgroundLyricHoldStore } from '../app/backgroundThrottling/backgroundLyricHoldStore';\nimport { resolveQianzhiPerformanceProfile } from '../../utils/qianzhiPerformance';",
    'visualizer model profile import',
);
model = replaceOnce(
    model,
    'backgroundStaticMode: shouldPauseVisualizerBackground',
        + '\n            || (',
    'backgroundStaticMode: shouldPauseVisualizerBackground\n            || resolveQianzhiPerformanceProfile().freezeAnimatedBackground\n            || (',
    'visualizer background throttling',
);
await write(modelPath, model);

const posterPath = resolve(root, 'src/library/suites/bravais/BravaisSeamPoster.tsx');
let poster = await read(posterPath);
poster = replaceOnce(
    poster,
    "import { getSizedCoverUrl } from '../../../utils/coverUrl';",
    "import { getSizedCoverUrl } from '../../../utils/coverUrl';\nimport { resolveQianzhiPerformanceProfile } from '../../../utils/qianzhiPerformance';",
    'Bravais poster profile import',
);
poster = replaceAll(
    poster,
    'getSizedCoverUrl(coverUrl, 1024)',
    'getSizedCoverUrl(coverUrl, resolveQianzhiPerformanceProfile().coverSize)',
    'Bravais full-size cover requests',
);
await write(posterPath, poster);

const preloaderPath = resolve(root, 'src/hooks/useLocalCoverPreloader.ts');
let preloader = await read(preloaderPath);
preloader = replaceOnce(
    preloader,
    "import { getSizedCoverUrl } from '../utils/coverUrl';",
    "import { getSizedCoverUrl } from '../utils/coverUrl';\nimport { resolveQianzhiPerformanceProfile } from '../utils/qianzhiPerformance';",
    'cover preloader profile import',
);
preloader = replaceOnce(
    preloader,
    'const PRELOAD_CONCURRENCY = 2;\nconst NEIGHBOR_INDEX_RADIUS = 12;\nconst INITIAL_INDEX_COUNT = 24;\nconst MAX_PRELOADED_URLS = 256;\nconst PRELOAD_TIMEOUT_MS = 15_000;',
    'const MAX_PRELOADED_URLS = 256;\nconst PRELOAD_TIMEOUT_MS = 15_000;',
    'cover preloader fixed budget',
);
preloader = replaceOnce(
    preloader,
    '): void => {\n    const candidates = useMemo(() => {',
    '): void => {\n    const performanceProfile = useMemo(() => resolveQianzhiPerformanceProfile(), []);\n    const candidates = useMemo(() => {',
    'cover preloader profile setup',
);
preloader = replaceAll(preloader, 'Math.min(INITIAL_INDEX_COUNT, coverCount)', 'Math.min(performanceProfile.initialPreloadCount, coverCount)', 'initial cover preload count');
preloader = replaceAll(preloader, 'index - NEIGHBOR_INDEX_RADIUS', 'index - performanceProfile.preloadNeighborRadius', 'cover preload lower neighbor bound');
preloader = replaceAll(preloader, 'index + NEIGHBOR_INDEX_RADIUS', 'index + performanceProfile.preloadNeighborRadius', 'cover preload upper neighbor bound');
preloader = replaceOnce(
    preloader,
    '}, [coverCount, getCoverUrl, renderedIndexes]);',
    '}, [coverCount, getCoverUrl, renderedIndexes, performanceProfile]);',
    'cover candidate memo dependencies',
);
preloader = replaceOnce(
    preloader,
    'Math.min(PRELOAD_CONCURRENCY, queue.length)',
    'Math.min(performanceProfile.preloadConcurrency, queue.length)',
    'cover preload concurrency',
);
preloader = replaceOnce(
    preloader,
    '}, [candidates]);',
    '}, [candidates, performanceProfile]);',
    'cover preloader effect dependencies',
);
await write(preloaderPath, preloader);

console.log('Applied adaptive Qianzhi mobile performance profile: smaller mobile covers, lighter background rendering and bounded cover preloading.');
