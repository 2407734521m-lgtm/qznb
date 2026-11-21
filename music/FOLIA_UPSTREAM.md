# Folia upstream

- Repository: https://github.com/chthollyphile/folia-major
- Release: `v0.7.28`
- Pinned commit: `a44758bbc02929225ca7304b5a4c4580d7b4e87b`
- License: GNU AGPL-3.0
- Original project includes an additional README usage statement: personal learning, technical exchange and non-profit testing only; no commercial-profit use.

The source is mounted as a Git submodule at `music/folia`. Always checkout with submodules enabled:

```bash
git clone --recurse-submodules https://github.com/2407734521m-lgtm/qznb.git
```

The pin was moved to v0.7.28 on 2026-11-18 (it was previously v0.7.27, reviewed after the release published on 2026-11-07). The v0.7.27 release adds a Spotify Soloist fallback, Apple Music playback/library improvements, FN Connect relay support and other fixes. Its source diff does not change Folia's existing `FloatingPlayerControls.tsx` file, so the build-time mobile gesture overlay can continue to target the same host capsule; CI is responsible for revalidating it against the new pin.

Do not change the upstream pin automatically. Update it deliberately after reviewing a Folia release, its license notices, deployment changes and compatibility with the Workers build.

## Local host overlay

The repository keeps Folia upstream unchanged and applies the small Lark-derived mobile swipe integration through `music/scripts/apply-folia-mobile-gestures.mjs` after submodule checkout. The script patches only the checked-out working tree used for the build; it does not push modifications to the original Folia project or change the pinned submodule commit. Verification and deployment workflows both run this overlay before installing dependencies and building.

The music service will remain non-commercial. Keep the upstream copyright/license files, publish the corresponding modified source and overlay to users of the hosted service, and retain the separate notices for every vendored project in `music/vendor/`.
