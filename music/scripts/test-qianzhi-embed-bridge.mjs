import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

const [parent, styles, bridgeSource, bridgeApplied, overlays, worker, audioSignals, visualizerBridge] = await Promise.all([
  read('src/components/MusicIsland.tsx'),
  read('src/components/MusicIsland.css'),
  read('music/overlays/QianzhiEmbedBridge.tsx'),
  read('music/folia/src/components/qianzhi/QianzhiEmbedBridge.tsx'),
  read('music/folia/src/components/app/overlays/AppOverlays.tsx'),
  read('music/folia/worker/index.ts'),
  read('music/folia/src/stores/motionSignals.ts'),
  read('music/folia/src/components/app/playback/bridges/usePlaybackVisualizerBridge.ts'),
]);

assert.equal(bridgeApplied, bridgeSource, 'The checked-out Folia bridge must match the maintained overlay source.');
assert.ok(parent.includes('event.origin !== MUSIC_ORIGIN'));
assert.ok(parent.includes('event.source !== frameRef.current?.contentWindow'));
assert.ok(parent.includes('const shouldMountFrame = openedOnce || isMusicPage'));
assert.ok(parent.includes('window.setInterval(sendHello, 2500)'));
assert.ok(parent.includes('Date.now() - lastSeen > 6500'));
assert.ok(parent.includes("onClick={() => sendCommand('toggle')}"));
assert.ok(parent.includes('onPointerUp={commitSeekDraft}'));
assert.ok(parent.includes('scale: isMusicPage ? 1 : 0.985'));
assert.ok(parent.includes('opacity: { duration: isMusicPage ? 0.34 : 0.36'));
assert.ok(parent.includes('y: { duration: isMusicPage ? 0.38 : 0.4'));
assert.ok(parent.includes('scale: { duration: isMusicPage ? 0.38 : 0.4'));
assert.ok(parent.includes('frameForeground ? 1000 : 1'), 'The music surface must stay above the destination route only during the exit animation.');
assert.ok(parent.includes('onAnimationComplete={() => {') && parent.includes('setFrameForeground(false)'), 'The music surface must release its stacking layer after the exit animation.');
assert.ok(parent.includes('setFrameForeground(true)'), 'The music surface must regain its stacking layer when reopened.');
assert.ok(parent.includes('mode="wait"'), 'Expanded and collapsed states must transition sequentially to avoid projection collisions.');
assert.ok(!parent.includes('layoutId="qz-music-island-shell"'), 'Avoid shared shell projection that can produce oversized circular artifacts in Android WebView.');
assert.ok(!parent.includes('layoutId="qz-music-island-cover"'), 'Avoid shared album-cover projection across differently sized layouts.');
assert.ok(parent.includes("transformOrigin: 'top center'"), 'Expanded panel must scale from a stable top-center origin.');
assert.ok(styles.includes('max-width: 100%;') && styles.includes('overflow-x: hidden;'), 'Expanded panel must remain inside the viewport bounds.');
assert.ok(parent.includes('/QianzhiApp\\//i.test(navigator.userAgent)'), 'The island must detect the Qianzhi Android app shell.');
assert.ok(parent.includes("is-qianzhi-app"), 'The Android app-specific island position must be applied.');
assert.ok(!parent.includes("filter: isMusicPage"), 'Avoid full-screen blur filters that can stutter on mobile WebViews.');
assert.ok(parent.includes("pointerEvents: isMusicPage ? 'auto' : 'none'"));
assert.ok(styles.includes('z-index: 1200;'));
assert.ok(styles.includes('qz-music-equalizer.is-playing i'));
assert.ok(styles.includes('var(--qz-music-eq-bass') && styles.includes('var(--qz-music-eq-treble'), 'The equalizer must use live analyser values.');
assert.ok(styles.includes('top: max(calc(env(safe-area-inset-top) + 8px), 18px);'));
assert.ok(parent.includes('className="qz-music-island-collapsed-main"'));
assert.ok(bridgeSource.includes('event.source !== window.parent'));
assert.ok(bridgeSource.includes("type: 'SPECTRUM'"), 'The music iframe must publish realtime analyser data.');
assert.ok(bridgeSource.includes('audioBands.bass.get()') && bridgeSource.includes('audioBands.treble.get()'), 'Spectrum data must come from Folia analyser bands.');
assert.ok(bridgeSource.includes('audioLevel.get()') && bridgeSource.includes("mode = hasSpectrumEnergy ? 'spectrum' : level > 0.008 ? 'level' : 'idle'"), 'Use RMS loudness when meaningful spectrum energy is unavailable.');
assert.ok(parent.includes("spectrum.mode === 'level'"), 'Main-site bars must consume RMS fallback messages.');
assert.ok(audioSignals.includes('export const audioLevel = motionValue(0);'), 'Folia must expose a dedicated actual-audio RMS signal.');
assert.ok(visualizerBridge.includes('getByteTimeDomainData(waveformData)'), 'RMS must be sampled from the existing playback analyser waveform.');
assert.ok(visualizerBridge.includes('audioLevel.set(normalizedRms)') && visualizerBridge.includes('audioLevel.set(0)'), 'Reset RMS when playback analyser data is unavailable.');
assert.ok(!bridgeSource.includes('getUserMedia'), 'The fallback must not request microphone access.');
assert.ok(bridgeSource.includes('audioBands.spectrum.get().length > 0'), 'Do not call synthetic idle breath an audio spectrum.');
assert.ok(bridgeSource.includes('window.setInterval(publishSpectrum, 50)'), 'Spectrum updates should be throttled to 20Hz.');
assert.ok(parent.includes("message.type === 'SPECTRUM'"), 'The main site must consume spectrum data.');
assert.ok(parent.includes('--qz-music-eq-bass'), 'The island meter must be driven by received frequency bands.');
assert.ok(styles.includes('var(--qz-music-eq-bass') && styles.includes('var(--qz-music-eq-treble'), 'Equalizer bars must use live band values.');
assert.ok(bridgeSource.includes('MAIN_SITE_ORIGINS.has(event.origin)'));
assert.ok(!bridgeSource.includes("postMessage(data, '*')"));
assert.ok(overlays.includes('<QianzhiEmbedBridge model={model} />'));
assert.ok(worker.includes("frame-ancestors 'self' https://qianzhi.pw https://www.qianzhi.pw"));
assert.ok(worker.includes("headers.delete('X-Frame-Options')"));
assert.ok(!worker.includes('return env.ASSETS.fetch(request);'));

console.log('Qianzhi persistent music bridge checks passed.');
