import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

const [parent, bridgeSource, bridgeApplied, overlays, worker] = await Promise.all([
  read('src/components/MusicIsland.tsx'),
  read('music/overlays/QianzhiEmbedBridge.tsx'),
  read('music/folia/src/components/qianzhi/QianzhiEmbedBridge.tsx'),
  read('music/folia/src/components/app/overlays/AppOverlays.tsx'),
  read('music/folia/worker/index.ts'),
]);

assert.equal(bridgeApplied, bridgeSource, 'The checked-out Folia bridge must match the maintained overlay source.');
assert.match(parent, /event\.origin !== MUSIC_ORIGIN/);
assert.match(parent, /event\.source !== frameRef\.current\?\.contentWindow/);
assert.match(parent, /const shouldMountFrame = openedOnce \|\| isMusicPage/);
assert.match(parent, /window\.setInterval\(sendHello, 2500\)/, 'The parent must retry the bridge handshake after iframe reloads.');
assert.match(parent, /if \(lastSeen > 0 && Date\.now\(\) - lastSeen > 6500\)/, 'A stale bridge must be detected instead of staying connected forever.');
assert.match(parent, /onClick=\{\(\) => sendCommand\('toggle'\)\}/, 'The compact capsule play button must actually toggle playback.');
assert.match(parent, /onPointerUp=\{commitSeekDraft\}/, 'Seeking should be committed when the user releases the progress control.');
assert.match(parent, /<motion\.div[\s\S]*className="qz-music-frame-host"[\s\S]*opacity: isMusicPage \? 1 : 0,[\s\S]*y: isMusicPage \? 0 : 8,[\s\S]*opacity: \{ duration: isMusicPage \? 0\.34 : 0\.3,[\s\S]*y: \{ duration: isMusicPage \? 0\.38 : 0\.32, ease: \[0\.22, 1, 0\.36, 1\] \}/, 'The persistent music iframe must use lightweight opacity and transform transitions.');
assert.doesNotMatch(parent, /filter: isMusicPage|blur\(5px\)/, 'Avoid full-screen blur filters that can stutter on mobile WebViews.');
assert.match(parent, /pointerEvents: isMusicPage \? 'auto' : 'none'/, 'The hidden player must not intercept taps.');
assert.match(parent, /opacity: \{ duration: 0\.26, ease: \[0\.22, 1, 0\.36, 1\], delay: 0\.06 \}/, 'The island should ease in after the music view begins fading.');
assert.match(parent, /scale: \{ duration: 0\.38, ease: \[0\.22, 1, 0\.36, 1\], delay: 0\.06 \}/, 'The island should use a restrained, non-bouncy scale transition.');
assert.match(parent, /className="qz-music-island-collapsed-main"/, 'The compact island must separate expand and playback actions.');
assert.match(bridgeSource, /event\.source !== window\.parent/);
assert.match(bridgeSource, /MAIN_SITE_ORIGINS\.has\(event\.origin\)/);
assert.doesNotMatch(bridgeSource, /postMessage\([\s\S]{0,300},\s*['"]\*['"]/);
assert.match(overlays, /<QianzhiEmbedBridge model=\{model\} \/>/);
assert.match(worker, /frame-ancestors 'self' https:\/\/qianzhi\.pw https:\/\/www\.qianzhi\.pw/);
assert.match(worker, /headers\.delete\('X-Frame-Options'\)/);
assert.doesNotMatch(worker, /return env\.ASSETS\.fetch\(request\);/);

console.log('Qianzhi persistent music bridge checks passed.');
