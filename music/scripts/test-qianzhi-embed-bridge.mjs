import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

const [parent, styles, bridgeSource, bridgeApplied, overlays, worker] = await Promise.all([
  read('src/components/MusicIsland.tsx'),
  read('src/components/MusicIsland.css'),
  read('music/overlays/QianzhiEmbedBridge.tsx'),
  read('music/folia/src/components/qianzhi/QianzhiEmbedBridge.tsx'),
  read('music/folia/src/components/app/overlays/AppOverlays.tsx'),
  read('music/folia/worker/index.ts'),
]);

assert.equal(bridgeApplied, bridgeSource, 'The checked-out Folia bridge must match the maintained overlay source.');
assert.match(parent, /event\\.origin !== MUSIC_ORIGIN/);
assert.match(parent, /event\\.source !== frameRef\\.current\\?\\.contentWindow/);
assert.match(parent, /const shouldMountFrame = openedOnce \\|\\| isMusicPage/);
assert.match(parent, /window\\.setInterval\\(sendHello, 2500\\)/, 'The parent must retry the bridge handshake after iframe reloads.');
assert.match(parent, /if \\(lastSeen > 0 && Date\\.now\\(\\) - lastSeen > 6500\\)/, 'A stale bridge must be detected instead of staying connected forever.');
assert.match(parent, /onClick=\\{\\(\\) => sendCommand\\('toggle'\\)\\}/, 'The compact capsule play button must actually toggle playback.');
assert.match(parent, /onPointerUp=\\{commitSeekDraft\\}/, 'Seeking should be committed when the user releases the progress control.');
assert.match(parent, /<motion\\.div[\\s\\S]*className="qz-music-frame-host"[\\s\\S]*opacity: isMusicPage \\? 1 : 0,[\\s\\S]*y: isMusicPage \\? 0 : 8,[\\s\\S]*scale: isMusicPage \\? 1 : 0\\.985,[\\s\\S]*opacity: \\{ duration: isMusicPage \\? 0\\.34 : 0\\.36,[\\s\\S]*y: \\{ duration: isMusicPage \\? 0\\.38 : 0\\.4,[\\s\\S]*scale: \\{ duration: isMusicPage \\? 0\\.38 : 0\\.4/, 'The persistent music iframe must use lightweight opacity and transform transitions.');
assert.match(parent, /zIndex: 1000,[\\s\\S]*pointerEvents: isMusicPage \\? 'auto' : 'none'/, 'The music surface must stay above the destination route for the full exit animation.');
assert.match(parent, /QianzhiApp/ , 'The island must detect the Qianzhi Android app shell.');
assert.match(parent, /is-qianzhi-app/, 'The Android app-specific island position must be applied.');
assert.doesNotMatch(parent, /filter: isMusicPage|blur\\(5px\\)/, 'Avoid full-screen blur filters that can stutter on mobile WebViews.');
assert.match(styles, /\\.qz-music-island-wrap \\{[\\s\\S]*z-index: 1200;[\\s\\S]*?\\.qz-music-island-wrap\\.is-qianzhi-app \\{[\\s\\S]*top: max\\(calc\\(env\\(safe-area-inset-top\\) \\+ 8px\\), 34px\\)/, 'The island must sit above page content and below the Android status bar.');
assert.match(parent, /opacity: \\{ duration: 0\\.26, ease: \\[0\\.22, 1, 0\\.36, 1\\], delay: 0\\.06 \\}/, 'The island should ease in after the music view begins fading.');
assert.match(parent, /scale: \\{ duration: 0\\.38, ease: \\[0\\.22, 1, 0\\.36, 1\\], delay: 0\\.06 \\}/, 'The island should use a restrained, non-bouncy scale transition.');
assert.match(parent, /className="qz-music-island-collapsed-main"/, 'The compact island must separate expand and playback actions.');
assert.match(bridgeSource, /event\\.source !== window\\.parent/);
assert.match(bridgeSource, /MAIN_SITE_ORIGINS\\.has\\(event\\.origin\\)/);
assert.doesNotMatch(bridgeSource, /postMessage\\([\\s\\S]{0,300},\\s*['"]\\*['"]/);
assert.match(overlays, /<QianzhiEmbedBridge model=\\{model\\} \\/>/);
assert.match(worker, /frame-ancestors 'self' https:\\/\\/qianzhi\\.pw https:\\/\\/www\\.qianzhi\\.pw/);
assert.match(worker, /headers\\.delete\\('X-Frame-Options'\\)/);
assert.doesNotMatch(worker, /return env\\.ASSETS\\.fetch\\(request\\);/);

console.log('Qianzhi persistent music bridge checks passed.');
