# Music open-source components

This folder prepares the independent `music.qianzhi.pw` service. It pins Folia as the complete Web music-player base and vendors selected reusable source modules from other open-source players.

## Runtime base

- Folia: `v0.7.26`
- Pinned commit: `cc6226e464050a456a2913e062374f23d3844cc5`
- Location: `music/folia` Git submodule
- Build: Node.js 24+
- Runtime: Cloudflare Workers + Static Assets
- Isolated worker name: `qianzhi-music`
- Custom domain: `music.qianzhi.pw`

See [Folia upstream and license](FOLIA_UPSTREAM.md) and [deployment instructions](DEPLOYMENT.md).

## Vendored source modules

### Lark
- Upstream: https://github.com/ca-x/lark
- Source commit: `c5ae829dae661446e090014637d44ae0e1017ea1`
- License: AGPL-3.0
- Copied: mobile mini-player component and touch-swipe gesture resolver
- Original `LICENSE` and `NOTICE.md` retained under `vendor/lark/`

### Listen1
- Upstream: https://github.com/listen1/listen1_chrome_extension
- Source commit: `3f24efa045125875a609dcb0f3f3f0be4edb8b37`
- License: MIT
- Copied: NetEase, QQ Music, Kugou, Kuwo and Migu provider adapters
- Original MIT license retained under `vendor/listen1/LICENSE`

## Folia host overlay

The original Lark player component depends on Lark-specific types, theme styles and Phosphor icons, while Folia already has its own integrated player capsule and playback store. To avoid mounting a second player UI, `scripts/apply-folia-mobile-gestures.mjs` applies the Lark swipe resolver to Folia's existing capsule at build time.

The overlay enables:
- Swipe right / left to move to the previous / next track while in the player view
- Swipe up to expand the capsule or enter the player view
- Swipe down to collapse the expanded capsule
- Existing seek-track and button touches are excluded, so the gesture layer does not steal their interactions

The overlay is idempotent, validates its source anchors, and creates a focused unit test inside the checked-out Folia submodule. Both verification and deployment workflows apply it before typecheck/build. The pinned Folia upstream source itself is not modified.

## Integration status

- Folia's own playback state, queue, player and audio pipeline remain the runtime foundation.
- Lark's gesture resolver is now connected through the build-time host overlay; the complete Lark mini-player component remains vendored for further review, not mounted as a duplicate player.
- Listen1's browser-extension adapters still rely on legacy host globals and old provider endpoints. They need wrappers and current compatibility checks before being used in Cloudflare Workers.

Do not present an unverified provider as working. Do not remove upstream licenses or notices. The music service remains non-commercial under the Folia project's usage statement. Publish the full corresponding source and applicable notices for the modified hosted service.
