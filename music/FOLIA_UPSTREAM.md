# Folia upstream

- Repository: https://github.com/chthollyphile/folia-major
- Release: `v0.7.29`
- Pinned commit: `4c4c3c3befee3f3305832fff958f14167e8d7537`
- License: GNU AGPL-3.0
- Original project includes an additional README usage statement: personal learning, technical exchange and non-profit testing only; no commercial-profit use.

The source is mounted as a Git submodule at `music/folia`. Always checkout with submodules enabled:

```bash
git clone --recurse-submodules https://github.com/2407734521m-lgtm/qznb.git
```

The pin was moved to v0.7.29 on 2026-11-22 (it was previously v0.7.28, reviewed after the release published on 2026-11-16). The v0.7.29 release adds a Lattice radio wall (latticeRadio, used under private FM), a new Metaphor lyric visualizer style, shuffle options (shuffle buttons next to Play All and a no-repeat round option), and a line-level TTML lyric timing fix. Its source diff changes Folia's existing `FloatingPlayerControls.tsx` file by only four lines, so the build-time mobile gesture overlay can continue to target the same host capsule; the settings touch-targets overlay did need anchor updates for 0.7.29 (the settings search field moved to `SettingsSearchField.tsx` and side-list rows are now `w-full`). CI is responsible for revalidating all overlays against the new pin.

Do not change the upstream pin automatically. Update it deliberately after reviewing a Folia release, its license notices, deployment changes and compatibility with the Workers build.

## Local host overlay

The repository keeps Folia upstream unchanged and applies the small Lark-derived mobile swipe integration through `music/scripts/apply-folia-mobile-gestures.mjs` after submodule checkout. The script patches only the checked-out working tree used for the build; it does not push modifications to the original Folia project or change the pinned submodule commit. Verification and deployment workflows both run this overlay before installing dependencies and building.

The music service will remain non-commercial. Keep the upstream copyright/license files, publish the corresponding modified source and overlay to users of the hosted service, and retain the separate notices for every vendored project in `music/vendor/`.
