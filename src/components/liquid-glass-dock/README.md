# Liquid Glass Dock component

Adapted from [clayharmon/webgl-liquid-glass](https://github.com/clayharmon/webgl-liquid-glass), version 0.3.0 source.

The component uses a spring-driven WebGL refractive lens with a CSS glass fallback. The upstream source is vendored locally instead of installed from npm because the referenced 0.3.0 package tarball returned 404 during CI. Upstream MIT attribution and the full license text are recorded in the repository root `THIRD_PARTY_NOTICES.md`.

Local adaptation: React event types are imported explicitly for this project's strict TypeScript/ES module settings. The visual and animation implementation is otherwise kept aligned with upstream source.
