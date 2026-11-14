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
assert.match(parent, /<motion\.div[\s\S]*className="qz-music-frame-host"[\s\S]*opacity: isMusicPage \? 1 : 0,[\s\S]*scale: isMusicPage \? 1 : 0\.985,[\s\S]*filter: isMusicPage \? 'blur\(0px\)' : 'blur\(5px\)'/, 'The music page must smoothly shrink, blur and fade when leaving.');
assert.match(parent, /pointerEvents: isMusicPage \? 'auto' : 'none'/, 'The hidden player must not intercept taps.');
assert.match(parent, /stiffness: 520, damping: 38, mass: 0\.72/, 'The island should land with a spring transition after the music page exits.');
assert.match(parent, /className="qz-music-island-collapsed-main"/, 'The compact island must separate expand and playback actions.');
assert.match(bridgeSource, /event\.source !== window\.parent/);
assert.match(bridgeSource, /MAIN_SITE_ORIGINS\.has\(event\.origin\)/);
assert.doesNotMatch(bridgeSource, /postMessage\([\s\S]{0,300},\s*['"]\*['"]/);
assert.match(overlays, /<QianzhiEmbedBridge model=\{model\} \/>/);
assert.match(worker, /frame-ancestors 'self' https:\/\/qianzhi\.pw https:\/\/www\.qianzhi\.pw/);
assert.match(worker, /headers\.delete\('X-Frame-Options'\)/);
assert.doesNotMatch(worker, /return env\.ASSETS\.fetch\(request\);/);

console.log('Qianzhi persistent music bridge checks passed.');
