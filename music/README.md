# Music open-source components

This folder prepares the independent `music.qianzhi.pw` service. It pins Folia as the complete Web music-player base and vendors selected reusable source modules from other open-source players.

## Runtime base

- Folia: `v0.7.27`
- Pinned commit: `4a545c96229664c0e07d4fb04971264e8d75fdd2`
- Location: `music/folia` Git submodule
- Build: Node.js 24+
- Runtime: Cloudflare Workers + Static Assets
- Isolated worker name: `qianzhi-music`
- Custom domain: `music.qianzhi.pw`

The pin was advanced after reviewing the v0.7.27 release notes and comparing it with v0.7.26. The player capsule file used by the Lark gesture overlay is unchanged in this release-to-release diff; the overlay will be validated again by CI.

See [Folia upstream and license](FOLIA_UPSTREAM.md) and [deployment instructions](DEPLOYMENT.md).

## Main-site account connection

An optional Settings → Help → About account row uses the existing Qianzhi Supabase Auth project. It supports email login and the main site's username-login Edge Function, stores a separate `qznb-music-auth-v1` session, and clears only that local session on sign-out. It shares the same Supabase user ID but is not seamless SSO; the user signs in once on the music hostname. Playback remains available without login. The build-time overlay is applied by `scripts/apply-qianzhi-account.mjs`; the GitHub deploy workflow expects the public key in `QZNB_SUPABASE_ANON_KEY`. Never use a service-role key in the frontend.

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
- Folia's NetEase API `v4.41.1` is exposed through an isolated Express 5 / Cloudflare Node HTTP adapter at `/api/netease`. The build overlay limits requests to the exact provider routes used by Folia, uses Axios's Fetch adapter instead of Node sockets, removes temporary-file state and outbound proxy options, and keeps login cookies in the browser session. QR login, search, song URL and all upstream behaviors still require live preview validation; no provider is considered production-ready before those checks pass.
- Listen1's copied master adapters are pinned to a repository revision last updated on 2025-06-17. Folia already has native NetEase, QQ and Kugou providers; the copied adapters for those services are not needed for a second implementation. Kuwo and Migu are the unique candidate additions, but their copied code depends on legacy browser-extension globals and provider endpoints. They need current endpoint tests and native Folia provider adapters before being enabled in Cloudflare Workers.

Do not present an unverified provider as working. Do not remove upstream licenses or notices. The music service remains non-commercial under the Folia project's usage statement. Publish the full corresponding source and applicable notices for the modified hosted service.
