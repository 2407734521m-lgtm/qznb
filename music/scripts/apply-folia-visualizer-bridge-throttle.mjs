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
    if (first < 0) throw new Error('Visualizer bridge throttle overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Visualizer bridge throttle overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};
const writeNewFile = async (path, content, label) => {
    let existing = '';
    try { existing = await read(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (existing && existing !== content) throw new Error('Refusing to overwrite an existing ' + label + ' with different contents.');
    if (!existing) await write(path, content);
};

// The bridge ran its whole audio-band block every frame — a fresh 1024-byte frequency array, the
// full spectrum/RMS pass, and a fresh empty array in the paused branch — even while no visualizer
// was mounted to read any of it. Three fixes, all in the bridge's own module:
//
// - The frequency array is double-buffered: two preallocated arrays, alternating per set. A
//   MotionValue only notifies when the value it is set to is a different reference (motion-dom's
//   updateAndNotify), so reusing one array would silently stop notifying; two arrays keep every
//   set a new reference while allocating only twice per session (and again only if the analyser's
//   bin count changes). Every consumer reads synchronously (.get() or an immediate copy), so
//   handing the next frame's buffer to the previous one is safe.
// - The band computation runs at full rate only while the visualizer is mounted (App.tsx reports
//   shouldMountPlayerVisualizer here); unmounted it runs at most every 50ms — 20fps, the OBS
//   audio publish interval, so the relay still reads fresh values — and the paused breath at most
//   every 66ms (~15fps, a ~12s sine: nothing visible changes).
// - The paused branch clears the spectrum once per idle stretch, with one shared empty array.

const throttlePath = resolve(root, 'src/components/app/playback/bridges/visualizerBandThrottle.ts');
const throttleSource = `// src/components/app/playback/bridges/visualizerBandThrottle.ts
// The visualizer bridge's per-frame audio-band work, throttled (batch 4, item 22): the frequency
// array is double-buffered instead of allocated per frame, the band computation runs at full rate
// only while the visualizer is mounted, and the paused breath is time-gated. Pure functions and a
// small stateful class, so it is unit-testable on its own.

/** The band update rate while nothing audio-reactive is on screen: 20fps, the OBS audio publish interval, so the relay still reads fresh values. */
export const AUDIO_BANDS_UNMOUNTED_INTERVAL_MS = 50;
/** The idle breath rate while paused: ~15fps. The breath is a ~12s sine, so nothing visible changes. */
export const IDLE_BREATH_INTERVAL_MS = 66;

/** One shared empty spectrum: the idle branch clears the spectrum with this, never a fresh array. */
export const EMPTY_SPECTRUM = new Uint8Array(0);

/** The per-frame band throttle for one visualizer bridge instance. */
export class AudioBandThrottle {
    private buffers: [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>] | null = null;
    private bufferLength = 0;
    private bufferIndex = 0;
    private lastAudibleMs = Number.NEGATIVE_INFINITY;
    private lastIdleMs = Number.NEGATIVE_INFINITY;
    private spectrumCleared = false;

    /** The next frequency buffer to fill: two preallocated arrays, alternating, so every set is a new reference (MotionValue only notifies on a changed reference) while the session allocates at most twice. Rebuilt only when the analyser's bin count changes. */
    nextSpectrumBuffer(length: number): Uint8Array<ArrayBuffer> {
        if (!this.buffers || this.bufferLength !== length) {
            this.buffers = [new Uint8Array(length), new Uint8Array(length)];
            this.bufferLength = length;
            this.bufferIndex = 0;
        }
        const buffer = this.buffers[this.bufferIndex];
        this.bufferIndex = 1 - this.bufferIndex;
        return buffer;
    }

    /** Whether the audible band computation runs on this frame: always while the visualizer is mounted, at most every 50ms while it is not. */
    shouldRunAudible(nowMs: number, mounted: boolean): boolean {
        if (mounted) {
            this.lastAudibleMs = nowMs;
            this.spectrumCleared = false;
            return true;
        }
        if (nowMs - this.lastAudibleMs < AUDIO_BANDS_UNMOUNTED_INTERVAL_MS) return false;
        this.lastAudibleMs = nowMs;
        this.spectrumCleared = false;
        return true;
    }

    /** Whether the idle breath updates on this frame: at most every 66ms while paused. */
    shouldRunIdle(nowMs: number): boolean {
        if (nowMs - this.lastIdleMs < IDLE_BREATH_INTERVAL_MS) return false;
        this.lastIdleMs = nowMs;
        return true;
    }

    /** Whether the spectrum still needs clearing: once per idle stretch, then live data resumes. */
    shouldClearSpectrum(): boolean {
        if (this.spectrumCleared) return false;
        this.spectrumCleared = true;
        return true;
    }
}
`;
await writeNewFile(throttlePath, throttleSource, 'visualizer band throttle helper');

const bridgePath = resolve(root, 'src/components/app/playback/bridges/usePlaybackVisualizerBridge.ts');
let bridge = await read(bridgePath);

bridge = replaceOnce(bridge,
    `import { tickBeatFx } from '../../../../services/beatFx/beatFxLive';`,
    `import { tickBeatFx } from '../../../../services/beatFx/beatFxLive';
import { AudioBandThrottle, EMPTY_SPECTRUM } from './visualizerBandThrottle';`,
    'throttle import');

// Whether the player visualizer is mounted (App.tsx, shouldMountPlayerVisualizer): the bands have
// no in-app consumer while it is unmounted, so the bridge throttles their computation. Written by
// App in an effect, read by the frame loop; one frame of staleness is irrelevant to a throttle
// decision. Starts true: the visualizer is mounted on the first screen.
bridge = replaceOnce(bridge,
    `// Runs the requestAnimationFrame loop for audio-reactive visuals and lyric timing.`,
    `let playerVisualizerMounted = true;

/** App.tsx reports the visualizer mount state here (see shouldMountPlayerVisualizer). */
export const setPlayerVisualizerMounted = (mounted: boolean): void => {
    playerVisualizerMounted = mounted;
};

// Runs the requestAnimationFrame loop for audio-reactive visuals and lyric timing.`,
    'mount flag and setter');

bridge = replaceOnce(bridge,
    `    const currentLineIndexRef = useRef(-1);`,
    `    const currentLineIndexRef = useRef(-1);
    const bandThrottleRef = useRef<AudioBandThrottle | null>(null);`,
    'band throttle ref');

bridge = replaceOnce(bridge,
    `    const updateLoop = useCallback(() => {`,
    `    const updateLoop = useCallback(() => {
        const bandThrottle = bandThrottleRef.current ?? new AudioBandThrottle();
        bandThrottleRef.current = bandThrottle;`,
    'band throttle instance');

bridge = replaceOnce(bridge,
    `        if (backgroundHold) {
            // The bands keep their last values: nothing draws from them while held.
        } else if (hasAudibleSignal && analyserRef.current) {
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);`,
    `        if (backgroundHold) {
            // The bands keep their last values: nothing draws from them while held.
        } else if (hasAudibleSignal && analyserRef.current && bandThrottle.shouldRunAudible(Date.now(), playerVisualizerMounted)) {
            // Full rate while the visualizer is mounted, ~20fps while it is not (the OBS audio
            // publish interval); throttled frames keep their last values (see the branch below).
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = bandThrottle.nextSpectrumBuffer(bufferLength);`,
    'audible branch now gated by the throttle');

bridge = replaceOnce(bridge,
    `            audioBands.treble.set(process(treble, 2));
        } else {
            audioLevel.set(0);
            const time = Date.now() / 2000;
            const breath = (Math.sin(time) + 1) * 20;
            audioPower.set(breath);
            audioBands.bass.set(breath);
            audioBands.lowMid.set(breath);
            audioBands.mid.set(breath);
            audioBands.vocal.set(breath);
            audioBands.treble.set(breath);
            audioBands.spectrum?.set(new Uint8Array(0));
        }`,
    `            audioBands.treble.set(process(treble, 2));
        } else if (hasAudibleSignal && analyserRef.current) {
            // Throttled frame (visualizer unmounted): the bands keep their last values.
        } else {
            audioLevel.set(0);
            // The spectrum is cleared once per idle stretch, with one shared empty array; the
            // breath itself only needs ~15fps (a ~12s sine), so it is time-gated.
            if (bandThrottle.shouldClearSpectrum()) audioBands.spectrum?.set(EMPTY_SPECTRUM);
            if (bandThrottle.shouldRunIdle(Date.now())) {
                const time = Date.now() / 2000;
                const breath = (Math.sin(time) + 1) * 20;
                audioPower.set(breath);
                audioBands.bass.set(breath);
                audioBands.lowMid.set(breath);
                audioBands.mid.set(breath);
                audioBands.vocal.set(breath);
                audioBands.treble.set(breath);
            }
        }`,
    'idle branch now clears once and gates the breath');

bridge = replaceOnce(bridge,
    `        audioRef,
        currentTime,`,
    `        audioRef,
        bandThrottleRef,
        currentTime,`,
    'band throttle ref in the loop dependencies');
await write(bridgePath, bridge);

// App reports the visualizer mount state to the bridge.
const appPath = resolve(root, 'src/App.tsx');
let app = await read(appPath);
app = replaceOnce(app,
    `import { usePlaybackVisualizerBridge } from './components/app/playback/bridges/usePlaybackVisualizerBridge';`,
    `import { setPlayerVisualizerMounted, usePlaybackVisualizerBridge } from './components/app/playback/bridges/usePlaybackVisualizerBridge';`,
    'bridge setter import');
app = replaceOnce(app,
    `        handoffKeepsVisualizer: wallHandoff.keepsVisualizer,
    });`,
    `        handoffKeepsVisualizer: wallHandoff.keepsVisualizer,
    });

    // The visualizer bridge throttles its per-frame band work while the visualizer is unmounted.
    useEffect(() => { setPlayerVisualizerMounted(shouldMountVisualizer); }, [shouldMountVisualizer]);`,
    'bridge mount report effect');
await write(appPath, app);

// The throttle: double buffering, the mounted/unmounted rates, and the once-per-idle clear.
const testPath = resolve(root, 'test/unit/visualizer/visualizerBandThrottle.test.ts');
const testSource = `import { describe, expect, it } from 'vitest';
import { AudioBandThrottle, AUDIO_BANDS_UNMOUNTED_INTERVAL_MS, EMPTY_SPECTRUM, IDLE_BREATH_INTERVAL_MS } from '@/components/app/playback/bridges/visualizerBandThrottle';

// test/unit/visualizer/visualizerBandThrottle.test.ts
// The visualizer bridge's per-frame band throttle (batch 4, item 22): the frequency array is
// double-buffered, the audible computation runs at full rate only while the visualizer is
// mounted, and the paused breath is time-gated.

describe('AudioBandThrottle', () => {
    it('alternates between two preallocated buffers and rebuilds them when the length changes', () => {
        const throttle = new AudioBandThrottle();
        const first = throttle.nextSpectrumBuffer(4);
        const second = throttle.nextSpectrumBuffer(4);
        const third = throttle.nextSpectrumBuffer(4);
        expect(first).not.toBe(second);
        expect(third).toBe(first);
        expect(first.length).toBe(4);
        const rebuilt = throttle.nextSpectrumBuffer(8);
        expect(rebuilt.length).toBe(8);
        expect(rebuilt).not.toBe(first);
        expect(rebuilt).not.toBe(second);
    });

    it('runs the audible bands every frame while the visualizer is mounted', () => {
        const throttle = new AudioBandThrottle();
        expect(throttle.shouldRunAudible(1000, true)).toBe(true);
        expect(throttle.shouldRunAudible(1001, true)).toBe(true);
        expect(throttle.shouldRunAudible(1002, true)).toBe(true);
    });

    it('runs the audible bands at most every 50ms while the visualizer is unmounted', () => {
        const throttle = new AudioBandThrottle();
        expect(throttle.shouldRunAudible(1000, false)).toBe(true);
        expect(throttle.shouldRunAudible(1001, false)).toBe(false);
        expect(throttle.shouldRunAudible(1000 + AUDIO_BANDS_UNMOUNTED_INTERVAL_MS - 1, false)).toBe(false);
        expect(throttle.shouldRunAudible(1000 + AUDIO_BANDS_UNMOUNTED_INTERVAL_MS, false)).toBe(true);
    });

    it('runs the idle breath at most every 66ms', () => {
        const throttle = new AudioBandThrottle();
        expect(throttle.shouldRunIdle(1000)).toBe(true);
        expect(throttle.shouldRunIdle(1001)).toBe(false);
        expect(throttle.shouldRunIdle(1000 + IDLE_BREATH_INTERVAL_MS - 1)).toBe(false);
        expect(throttle.shouldRunIdle(1000 + IDLE_BREATH_INTERVAL_MS)).toBe(true);
    });

    it('clears the spectrum once per idle stretch, and again after live data resumes', () => {
        const throttle = new AudioBandThrottle();
        expect(throttle.shouldClearSpectrum()).toBe(true);
        expect(throttle.shouldClearSpectrum()).toBe(false);
        expect(throttle.shouldRunAudible(1000, true)).toBe(true);
        expect(throttle.shouldClearSpectrum()).toBe(true);
        expect(throttle.shouldClearSpectrum()).toBe(false);
    });

    it('shares one empty spectrum array', () => {
        expect(EMPTY_SPECTRUM.length).toBe(0);
        expect(EMPTY_SPECTRUM).toBeInstanceOf(Uint8Array);
    });
});
`;
await writeNewFile(testPath, testSource, 'visualizer band throttle unit test');

console.log('Applied visualizer bridge throttle: double-buffered spectrum, mounted-rate bands, gated idle breath.');
