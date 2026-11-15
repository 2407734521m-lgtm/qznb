import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

const [
  parent,
  activity,
  styles,
  islandRoot,
  bridgeSource,
  bridgeApplied,
  overlays,
  worker,
  audioSignals,
  visualizerBridge,
] = await Promise.all([
  read('src/components/MusicIsland.tsx'),
  read('src/components/QianzhiMusicIslandActivity.tsx'),
  read('src/components/MusicIsland.css'),
  read('src/lib/island/island-root.tsx'),
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

// The music control presentation now lives in the Qianzhi activity component, not MusicIsland.tsx.
assert.ok(parent.includes('useIslandActions()'));
assert.ok(parent.includes('createMusicIslandActivity(toggleExpanded)'));
assert.ok(parent.includes("islandApi.end('music-playback')"));
assert.ok(activity.includes("onClick={() => sendCommand('toggle')}"));
assert.ok(activity.includes('onPointerUp={commitSeekDraft}'));
assert.ok(activity.includes("sendCommand('previous')"));
assert.ok(activity.includes("sendCommand('next')"));
assert.ok(activity.includes('onClick={openMusic}'));
assert.ok(activity.includes('MusicCompactContent'));
assert.ok(activity.includes('MusicSpectrumContent'));
assert.ok(activity.includes('MusicExpandedControls'));
assert.ok(activity.includes('type="range"'));

// The new engine owns the morph, press handling, outside press and Escape behaviour.
assert.ok(activity.includes('<Island'));
assert.ok(activity.includes('placement="viewport"'));
assert.ok(activity.includes('keyline="off"'));
assert.ok(activity.includes("top: 'var(--qz-island-anchor-top, max(env(safe-area-inset-top, 0px), 18px))'"), 'The island must sit at least 18px below the top so it clears the Android status bar.');
// The anchor is a token now (task drawer shares it): its default must still be the 18px rule,
// and the only lower value (8px) must stay scoped to short landscape viewports.
assert.ok(styles.includes('--qz-island-anchor-top: max(env(safe-area-inset-top, 0px), 18px);'), 'The island anchor must default to at least 18px below the top.');
assert.ok(
  styles.indexOf('--qz-island-anchor-top: max(env(safe-area-inset-top, 0px), 8px);') >
    styles.indexOf('@media (orientation: landscape) and (max-height: 560px)'),
  'The 8px island anchor is only allowed inside the short-landscape exception.',
);
assert.ok(islandRoot.includes('onPointerDown'));
assert.ok(islandRoot.includes('Escape'));
assert.ok(islandRoot.includes('addEventListener("pointerdown"'));
assert.ok(islandRoot.includes('store.api.collapse()'));
assert.ok(parent.includes('shouldShowMainIsland(isMusicPage, activityIds)'), 'The main island must hide on the music page unless another activity is live.');
assert.ok(parent.includes('hostRef={islandWrapRef}'));

assert.ok(parent.includes('opacity: { duration: isMusicPage ? 0.34 : 0.36'));
assert.ok(!parent.includes('scale: isMusicPage ? 1 : 0.985'), 'The music surface fades on opacity only; sliding and scaling the whole page fought the island entrance.');
assert.ok(!parent.includes('y: isMusicPage ? 0 : 8'), 'The music surface fades on opacity only.');
assert.ok(parent.includes('frameForeground ? 1000 : 1'), 'The music surface must stay above the destination route only during the exit animation.');
assert.ok(parent.includes('onAnimationComplete={() => {') && parent.includes('setFrameForeground(false)'), 'The music surface must release its stacking layer after the exit animation.');
assert.ok(parent.includes('setFrameForeground(true)'), 'The music surface must regain its stacking layer when reopened.');
assert.ok(parent.includes("pointerEvents: isMusicPage ? 'auto' : 'none'"));
assert.ok(styles.includes('z-index: 4001;'), 'The island host must float above page content and chat wallpapers.');
assert.ok(styles.includes('.qz-island-wave'));
assert.ok(styles.includes('var(--qz-music-eq-bass') && styles.includes('var(--qz-music-eq-treble'), 'Equalizer bars must use live analyser band values.');
assert.ok(styles.includes('qz-island-expanded-bottom'));
assert.ok(!styles.includes('qz-music-island-collapsed'), 'Legacy duplicate MusicIsland presentation styles should stay removed.');

assert.ok(parent.includes("spectrum.mode === 'level'"), 'Main-site bars must consume RMS fallback messages.');
assert.ok(parent.includes("message.type === 'SPECTRUM'"), 'The main site must consume spectrum data.');
assert.ok(parent.includes('resolveMusicEqualizerMode(spectrum)'), 'Playing bars must select live or visual fallback mode.');
assert.ok(parent.includes('host.dataset.qzMusicEqMode = equalizerMode'), 'The main site must expose equalizer mode to the island CSS.');
assert.ok(parent.includes("setAttribute('data-qz-music-eq-mode', 'idle')"), 'Pause and no-track states must stop the fallback bars.');
assert.ok(bridgeSource.includes("hasAudioLevel ? 'level' : 'fallback'"), 'Routes without useful analyser data must explicitly enable the visual fallback.');
assert.ok(styles.includes('data-qz-music-eq-mode="fallback"'), 'The CSS must animate the playing bars when analyser data is unavailable.');
assert.ok(styles.includes('@keyframes qz-island-eq-fallback-bass'), 'The fallback must move bar heights, not only glow.');

assert.ok(parent.includes('style.setProperty(`--qz-music-eq-${name}`'), 'The island meter must be driven by received frequency bands.');
assert.ok(audioSignals.includes('export const audioLevel = motionValue(0);'), 'Folia must expose a dedicated actual-audio RMS signal.');
assert.ok(visualizerBridge.includes('getByteTimeDomainData(waveformData)'), 'RMS must be sampled from the existing playback analyser waveform.');
assert.ok(visualizerBridge.includes('audioLevel.set(previousLevel + (normalizedRms - previousLevel) * levelSmoothing)') && visualizerBridge.includes('audioLevel.set(0)'), 'Smooth the live RMS envelope and reset when analyser data is unavailable.'); 
assert.ok(!bridgeSource.includes('getUserMedia'), 'The fallback must not request microphone access.');
assert.ok(bridgeSource.includes('const spectrumData = audioBands.spectrum.get()') && bridgeSource.includes('spectrumData.length > 0'), 'Do not call synthetic idle breath an audio spectrum.');
assert.ok(bridgeSource.includes('if (!playing) return;'), 'Spectrum updates stop while paused.');
assert.ok(bridgeSource.includes('if (!document.hidden) publishSpectrum();'), 'Spectrum updates stop while the tab is in the background.');
assert.ok(bridgeSource.includes('}, 120);'), 'Spectrum updates should be throttled to match the equalizer transition.');
assert.ok(bridgeSource.includes('if (!document.hidden) publish();'), 'STATE updates stop while the tab is in the background.');
assert.ok(bridgeSource.includes('MAIN_SITE_ORIGINS.has(event.origin)'));
assert.ok(!bridgeSource.includes("postMessage(data, '*')"));
assert.ok(overlays.includes('<QianzhiEmbedBridge model={model} />'));
assert.ok(worker.includes("frame-ancestors 'self' https://qianzhi.pw https://www.qianzhi.pw"));
assert.ok(worker.includes("headers.delete('X-Frame-Options')"));
assert.ok(!worker.includes('return env.ASSETS.fetch(request);'));

console.log('Qianzhi persistent music bridge checks passed.');
