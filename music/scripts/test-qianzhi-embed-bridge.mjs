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
assert.match(bridgeSource, /event\.source !== window\.parent/);
assert.match(bridgeSource, /MAIN_SITE_ORIGINS\.has\(event\.origin\)/);
assert.doesNotMatch(bridgeSource, /postMessage\([\s\S]{0,300},\s*['"]\*['"]/);
assert.match(overlays, /<QianzhiEmbedBridge model=\{model\} \/>/);
assert.match(worker, /frame-ancestors 'self' https:\/\/qianzhi\.pw https:\/\/www\.qianzhi\.pw/);
assert.match(worker, /headers\.delete\('X-Frame-Options'\)/);
assert.doesNotMatch(worker, /return env\.ASSETS\.fetch\(request\);/);

console.log('Qianzhi persistent music bridge checks passed.');
