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
- Copied: mobile mini-player component and touch-swipe gesture logic
- Original `LICENSE` and `NOTICE.md` retained under `vendor/lark/`

### Listen1
- Upstream: https://github.com/listen1/listen1_chrome_extension
- Source commit: `3f24efa045125875a609dcb0f3f3f0be4edb8b37`
- License: MIT
- Copied: NetEase, QQ Music, Kugou, Kuwo and Migu provider adapters
- Original MIT license retained under `vendor/listen1/LICENSE`

## Integration status

The Folia source is pinned, and the reusable Lark/Listen1 source files are copied into this repository. The copied modules are **not yet enabled in the running music player**:

- Lark's mini-player imports Lark-specific types and Phosphor icons. It needs a Folia player-state adapter, styles and dependency review.
- Listen1's adapters target a browser-extension host, rely on legacy globals and contain old provider endpoints. They need wrappers and live compatibility checks before being used in Cloudflare Workers.

Do not present an unverified provider as working. Do not remove upstream licenses or notices. The music service remains non-commercial under the Folia project's usage statement. Publish the full corresponding source and applicable notices for the modified hosted service.
