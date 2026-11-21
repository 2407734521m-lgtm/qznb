import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

const [
  parent,
  activity,
  styles,
  islandRoot,
  islandSurface,
  bridgeSource,
  bridgeApplied,
  overlays,
  worker,
  audioSignals,
  visualizerBridge,
  qianzhiMetrics,
] = await Promise.all([
  read('src/components/MusicIsland.tsx'),
  read('src/components/QianzhiMusicIslandActivity.tsx'),
  read('src/components/MusicIsland.css'),
  read('src/lib/island/island-root.tsx'),
  read('src/lib/island/surface.tsx'),
  read('music/overlays/QianzhiEmbedBridge.tsx'),
  read('music/folia/src/components/qianzhi/QianzhiEmbedBridge.tsx'),
  read('music/folia/src/components/app/overlays/AppOverlays.tsx'),
  read('music/folia/worker/index.ts'),
  read('music/folia/src/stores/motionSignals.ts'),
  read('music/folia/src/components/app/playback/bridges/usePlaybackVisualizerBridge.ts'),
  read('src/lib/island/qianzhi-metrics.ts'),
]);

assert.equal(bridgeApplied, bridgeSource, 'The checked-out Folia bridge must match the maintained overlay source.');
assert.ok(parent.includes('event.origin !== MUSIC_ORIGIN'));
assert.ok(parent.includes('event.source !== frameRef.current?.contentWindow'));
assert.ok(parent.includes('const shouldMountFrame = openedOnce || isMusicPage'));
assert.ok(parent.includes('window.setInterval(sendHello, 2500)'));
assert.ok(parent.includes('Date.now() - lastSeen > 6500'));

// The music control presentation now lives in the Qianzhi activity component, not MusicIsland.tsx.
assert.ok(parent.includes('useIslandActions()'));
assert.ok(parent.includes("createMusicIslandActivity(() => islandApi.expand('music-playback'))"), 'Tapping the music pill must expand the island in place instead of opening the fullscreen player.');
assert.ok(parent.includes('openFullscreenPlayer'), 'The fullscreen player opener must still exist for the expanded island button.');
assert.ok(parent.includes("islandApi.end('music-playback')"));
assert.ok(activity.includes("onClick={() => sendCommand('toggle')}"));
assert.ok(activity.includes('onPointerUp={commitSeekDraft}'));
assert.ok(activity.includes("sendCommand('previous')"));
assert.ok(activity.includes("sendCommand('next')"));
assert.ok(activity.includes('onClick={openFullscreenPlayer}'), 'The expanded open button must open the fullscreen player.');
assert.ok(activity.includes('MusicCompactContent'));
assert.ok(activity.includes('MusicSpectrumContent'));
assert.ok(activity.includes('MusicExpandedControls'));
assert.ok(activity.includes('type="range"'));

// Volume travels both ways across the bridge: the island shows the live level
// and drives it, and the Folia side applies it to the real audio settings.
assert.ok(activity.includes("sendCommand('volume'"), 'The expanded island must send volume changes across the bridge.');
assert.ok(activity.includes("sendCommand('mute'"), 'The expanded island must send mute changes across the bridge.');
assert.ok(activity.includes('aria-label="音量"'), 'The volume slider must be labelled.');
assert.ok(activity.includes('qz-island-volume'), 'The expanded island must render a volume row.');

// The expanded island is a floating player card, not a fullscreen page: cover,
// progress and five controls (ten-second skips included) must all fit inside
// the painted capsule, so the card is sized for its content.
assert.ok(activity.includes('back10') && activity.includes('forward10'), 'The expanded island must offer ten-second skip buttons like the fullscreen player.');
assert.ok(activity.includes("sendCommand('seek'"), 'The ten-second skip buttons must seek across the bridge.');
assert.ok(qianzhiMetrics.includes('expanded: { maxHeight: 224 }'), 'The expanded card must be tall enough for the full player instead of clipping the controls row.');
assert.ok(parent.includes('volume: number | null'), 'The main-site track must carry the reported volume, or null when unreported.');
assert.ok(parent.includes('isMuted: boolean'), 'The main-site track must carry the mute state.');
assert.ok(parent.includes("'volume' | 'mute'"), 'The main-site command set must include volume and mute.');
assert.ok(bridgeSource.includes("command?: 'toggle' | 'previous' | 'next' | 'seek' | 'volume' | 'mute'"), 'The bridge must accept volume and mute commands.');
assert.ok(bridgeSource.includes('handleSetVolume'), 'The bridge must apply volume commands to the Folia audio settings.');
assert.ok(bridgeSource.includes('handleSetMuted'), 'The bridge must apply mute commands to the Folia audio settings.');
assert.ok(bridgeSource.includes('volume: Number.isFinite(playback.volume)'), 'The bridge must report the live volume in STATE.');
assert.ok(bridgeSource.includes('isMuted: playback.isMuted === true'), 'The bridge must report the mute state in STATE.');
assert.ok(bridgeSource.includes("case 'volume':"), 'The bridge must handle the volume command.');
assert.ok(bridgeSource.includes("case 'mute':"), 'The bridge must handle the mute command.');

// The open-music button must not wear a queue-looking list icon.
assert.ok(!activity.includes('name="list"'), 'The queue-looking list icon must not stay on the open-music button.');
assert.ok(activity.includes('name="open"'), 'The open-music button must use an open icon.');

// With no live activity the island mounts nothing at the top: no empty black
// capsule, and no idle music recall edge — the music shortcut was removed,
// so the island only appears once an activity starts.
assert.ok(activity.includes('shouldShowIslandHost'), 'The island-host decision must be an explicit, tested helper.');
assert.ok(!activity.includes('shouldShowIslandIdleRecall'), 'The idle recall helper must be gone with the music shortcut.');
assert.ok(!activity.includes('className="qz-island-idle"'), 'No idle recall edge may render.');
assert.ok(!styles.includes('.qz-island-idle'), 'The recall edge styles must be gone with the music shortcut.');
assert.ok(styles.includes('[data-qz-island-settings-open="true"]'), 'Opening the island settings must hide the live island chrome so it cannot double the preview.');

// Collapse/restore must stay inside the 220–360ms band, and the collapsed
// restore target must be at least 44px tall.
assert.ok(!styles.includes('420ms'), 'No 420ms island transition may remain.');
assert.ok(styles.includes('transform 360ms'), 'The dock/restore slide must run at 360ms.');
assert.ok(islandSurface.includes('Math.max(44, pill.height)'), 'The collapsed pill hit area must be at least 44px tall.');
assert.ok(styles.includes('height: 44px;'), 'The peek restore button must be at least 44px tall.');

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
assert.ok(
  parent.includes('if (!hasTrack || isMusicPage)') && parent.includes("islandApi.end('music-playback')"),
  'The music playback activity must end on the music page so it does not create an idle island there.',
);
assert.ok(
  activity.includes('shouldShowIslandHost(value.activityIds)'),
  'The island host must still appear when another live activity exists.',
);
// The equalizer state target is the island host itself now (2026-11-21, #785):
// MusicIslandView mounts once, gated by shouldShowMainIsland, and renders the
// host div with ref={hostRef}. The old always-mounted hidden div is gone on
// purpose — giving it the same ref would steal the target from the visible
// island host (React points a ref at the last element that mounts with it)
// and freeze the pill's equalizer bars. When music plays, the activity is
// live so the host is mounted; on the music page the island does not mount
// for music-only activity, but there the island bars are not visible and the
// fullscreen player cannot be open, so no equalizer state is needed.
assert.ok(
  parent.includes('hostRef={islandWrapRef}'),
  'The island host must carry the equalizer state ref.',
);
assert.ok(
  parent.includes('{shouldShowMainIsland(isMusicPage, activityIds) && ('),
  'The island must mount once, gated by shouldShowMainIsland, without a duplicate island.',
);
assert.ok(
  !parent.includes('<div ref={islandWrapRef} hidden aria-hidden="true" />'),
  'The old hidden equalizer div must stay gone: it would steal the ref from the island host.',
);
assert.ok(
  activity.includes('ref={hostRef}'),
  'The active island host must use the dedicated host ref in the activity component.',
);

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
