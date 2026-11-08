# Folia upstream

- Repository: https://github.com/chthollyphile/folia-major
- Release: `v0.7.26`
- Pinned commit: `cc6226e464050a456a2913e062374f23d3844cc5`
- License: GNU AGPL-3.0
- Original project includes an additional README usage statement: personal learning, technical exchange and non-profit testing only; no commercial-profit use.

The source is mounted as a Git submodule at `music/folia`. Always checkout with submodules enabled:

```bash
git clone --recurse-submodules https://github.com/2407734521m-lgtm/qznb.git
```

Do not change the upstream pin automatically. Update it deliberately after reviewing a Folia release, its license notices, deployment changes and compatibility with the Workers build.

## Local host overlay

The repository keeps Folia upstream unchanged and applies the small Lark-derived mobile swipe integration through `music/scripts/apply-folia-mobile-gestures.mjs` after submodule checkout. The script patches only the checked-out working tree used for the build; it does not push modifications to the original Folia project or change the pinned submodule commit. Verification and deployment workflows both run this overlay before installing dependencies and building.

The music service will remain non-commercial. Keep the upstream copyright/license files, publish the corresponding modified source and overlay to users of the hosted service, and retain the separate notices for every vendored project in `music/vendor/`.
