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
assert.ok(parent.includes('zIndex: 1000'), 'The music surface must stay above the destination route for the full exit animation.');
assert.ok(parent.includes('/QianzhiApp\\//i.test(navigator.userAgent)'), 'The island must detect the Qianzhi Android app shell.');
assert.ok(parent.includes("is-qianzhi-app"), 'The Android app-specific island position must be applied.');
assert.ok(!parent.includes("filter: isMusicPage"), 'Avoid full-screen blur filters that can stutter on mobile WebViews.');
assert.ok(parent.includes("pointerEvents: isMusicPage ? 'auto' : 'none'"));
assert.ok(styles.includes('z-index: 1200;'));
assert.ok(styles.includes('top: max(calc(env(safe-area-inset-top) + 8px), 34px);'));
assert.ok(parent.includes('className="qz-music-island-collapsed-main"'));
assert.ok(bridgeSource.includes('event.source !== window.parent'));
assert.ok(bridgeSource.includes('MAIN_SITE_ORIGINS.has(event.origin)'));
assert.ok(!bridgeSource.includes("postMessage(data, '*')"));
assert.ok(overlays.includes('<QianzhiEmbedBridge model={model} />'));
assert.ok(worker.includes("frame-ancestors 'self' https://qianzhi.pw https://www.qianzhi.pw"));
assert.ok(worker.includes("headers.delete('X-Frame-Options')"));
assert.ok(!worker.includes('return env.ASSETS.fetch(request);'));

console.log('Qianzhi persistent music bridge checks passed.');
