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
    reduceComplexMotion: boolean;
};

/** Reads browser hints without requiring experimental Navigator fields to exist on every browser. */
export const readQianzhiPerformanceHints = (): QianzhiPerformanceHints => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined' || typeof document === 'undefined') return {};
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
        reduceComplexMotion: mobile || constrained,
        preloadConcurrency: balanced ? 1 : 2,
        preloadNeighborRadius: networkConstrained ? 3 : balanced ? 6 : 12,
        initialPreloadCount: networkConstrained ? 4 : balanced ? 8 : 24,
        networkConstrained,
    };
};

const AUTO_REDUCED_MOTION_SURFACES = new Set([
    'lattice',
    'transitionOverlay',
    'collectionMorph',
    'monetBackground',
]);

/** Only complex, large-area motion is auto-reduced; small control feedback stays animated. */
export const shouldAutoReduceQianzhiMotion = (
    surface: string,
    hints?: QianzhiPerformanceHints,
): boolean => (
    AUTO_REDUCED_MOTION_SURFACES.has(surface)
    && resolveQianzhiPerformanceProfile(hints).reduceComplexMotion
);
`;

let profile = '';
try { profile = await read(profilePath); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
if (profile && profile !== profileSource) throw new Error('Refusing to overwrite an existing Qianzhi performance profile.');
if (!profile) await writeFile(profilePath, profileSource, 'utf8');

const motionSettingsPath = resolve(root, 'src/stores/useMotionSettingsStore.ts');
let motionSettings = await read(motionSettingsPath);
motionSettings = replaceOnce(
    motionSettings,
    "import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';",
    "import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';\nimport { shouldAutoReduceQianzhiMotion } from '../utils/qianzhiPerformance';",
    'motion settings performance import',
);
motionSettings = replaceOnce(
    motionSettings,
    '    state.reducedMotionSurfaces[surface]\n    || (state.followSystemReducedMotion && state.systemPrefersReducedMotion)\n);',
    '    state.reducedMotionSurfaces[surface]\n    || (state.followSystemReducedMotion && state.systemPrefersReducedMotion)\n    || shouldAutoReduceQianzhiMotion(surface)\n);',
    'automatic heavy-motion fallback',
);
await write(motionSettingsPath, motionSettings);

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
    'backgroundStaticMode: shouldPauseVisualizerBackground\n            || (',
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
    '): void => {\n  const candidates = useMemo(() => {',
    '): void => {\n  const performanceProfile = useMemo(() => resolveQianzhiPerformanceProfile(), []);\n  const candidates = useMemo(() => {',
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

const performanceTestPath = resolve(root, 'test/unit/utils/qianzhiPerformance.test.ts');
const performanceTestSource = "import { describe, expect, it } from 'vitest';\nimport { resolveQianzhiPerformanceProfile, shouldAutoReduceQianzhiMotion } from '@/utils/qianzhiPerformance';\n\ndescribe('Qianzhi adaptive performance profile', () => {\n    it('keeps full-quality rendering and normal preload budget on desktop', () => {\n        expect(resolveQianzhiPerformanceProfile({\n            isMobile: false,\n            deviceMemory: 16,\n            hardwareConcurrency: 12,\n        })).toEqual({\n            coverSize: 1024,\n            freezeAnimatedBackground: false,\n            preloadConcurrency: 2,\n            preloadNeighborRadius: 12,\n            initialPreloadCount: 24,\n            networkConstrained: false,\n            reduceComplexMotion: false,\n        });\n    });\n\n    it('reduces cover size, background work and preload traffic on phones', () => {\n        expect(resolveQianzhiPerformanceProfile({\n            isMobile: true,\n            deviceMemory: 8,\n            hardwareConcurrency: 8,\n        })).toEqual({\n            coverSize: 512,\n            freezeAnimatedBackground: true,\n            preloadConcurrency: 1,\n            preloadNeighborRadius: 6,\n            initialPreloadCount: 8,\n            networkConstrained: false,\n            reduceComplexMotion: true,\n        });\n    });\n\n    it('uses the smallest network budget when data saver or a slow connection is active', () => {\n        expect(resolveQianzhiPerformanceProfile({\n            isMobile: false,\n            hardwareConcurrency: 8,\n            saveData: true,\n            effectiveType: '4g',\n        })).toMatchObject({\n            coverSize: 512,\n            freezeAnimatedBackground: true,\n            preloadConcurrency: 1,\n            preloadNeighborRadius: 3,\n            initialPreloadCount: 4,\n            networkConstrained: true,\n            reduceComplexMotion: true,\n        });\n    });\n\n    it('settles animated backgrounds on low-memory or low-core devices', () => {\n        expect(resolveQianzhiPerformanceProfile({\n            isMobile: false,\n            deviceMemory: 4,\n            hardwareConcurrency: 8,\n        }).freezeAnimatedBackground).toBe(true);\n        expect(resolveQianzhiPerformanceProfile({\n            isMobile: false,\n            deviceMemory: 8,\n            hardwareConcurrency: 4,\n        }).freezeAnimatedBackground).toBe(true);\n    });\n\n    it('auto-reduces only complex motion on mobile and constrained devices', () => {\n        const mobile = { isMobile: true, deviceMemory: 8, hardwareConcurrency: 8 };\n        expect(shouldAutoReduceQianzhiMotion('lattice', mobile)).toBe(true);\n        expect(shouldAutoReduceQianzhiMotion('collectionMorph', mobile)).toBe(true);\n        expect(shouldAutoReduceQianzhiMotion('uiMicroMotion', mobile)).toBe(false);\n        expect(shouldAutoReduceQianzhiMotion('settingsScroll', mobile)).toBe(false);\n        expect(shouldAutoReduceQianzhiMotion('lattice', {\n            isMobile: false, deviceMemory: 16, hardwareConcurrency: 12,\n        })).toBe(false);\n    });\n});\n"
let existingPerformanceTest = '';
try { existingPerformanceTest = await read(performanceTestPath); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
if (existingPerformanceTest && existingPerformanceTest !== performanceTestSource) {
    throw new Error('Refusing to overwrite an existing Qianzhi performance test.');
}
if (!existingPerformanceTest) await writeFile(performanceTestPath, performanceTestSource, 'utf8');

console.log('Applied adaptive Qianzhi mobile performance profile: smaller mobile covers, lighter background rendering and bounded cover preloading.');
