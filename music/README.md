# Music open-source components

This folder vendors selected source files for the separate `music.qianzhi.pw` project.
They are copied from upstream repositories, not rewritten from screenshots.

## Included source

### Lark
- Upstream: https://github.com/ca-x/lark
- Pinned upstream commit: `c5ae829dae661446e090014637d44ae0e1017ea1`
- License: AGPL-3.0
- Copied files: mobile mini-player and player swipe gesture logic
- Original `LICENSE` and `NOTICE.md` are retained in `vendor/lark/`.

### Listen1
- Upstream: https://github.com/listen1/listen1_chrome_extension
- Pinned upstream commit: `3f24efa045125875a609dcb0f3f3f0be4edb8b37`
- License: MIT
- Copied files: NetEase, QQ Music, Kugou, Kuwo and Migu provider adapters
- Original MIT license is retained in `vendor/listen1/LICENSE`.

## Integration notes

These are vendored upstream source files, not yet wired into Folia's runtime. The Listen1 adapters were written for its browser-extension host and use legacy provider endpoints and globals; they must be wrapped, checked for current endpoint behavior, and tested before being enabled in a Workers deployment. Lark's mini-player component imports Lark-specific types and Phosphor icons; it must be adapted to Folia's player state and dependency set before being enabled.

Do not remove the upstream notices. The resulting public music service remains non-commercial and must publish the corresponding modified source and applicable license notices. This folder does not claim that all provider endpoints are currently operational.
