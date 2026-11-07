# Frontend CSS architecture (phase 1)

This document records the current cascade contract for the global stylesheet stack. The stylesheets still contain legacy rules that are being migrated incrementally; do not assume every older selector has already been deduplicated.

## Import order

The global imports in `src/main.tsx` are intentionally ordered:

1. `styles.css`: base layout, legacy component primitives, navigation and shared page geometry.
2. `styles-cinematic.css`, `styles-editorial.css`, `styles-desktop.css`, `styles-premium.css`, `styles-motion-polish.css`, `styles-particle-flower.css`, `styles-visual-rules.css`: compatibility and feature refinements that still override parts of the base layer.
3. `styles-liquid-glass.css` and `styles-liquid-backdrop.css`: glass surfaces and dedicated backdrop treatments.
4. `styles-ios26-tokens.css`: canonical iOS 26 / Liquid Glass material variables. It must load after legacy theme sheets and before the material component stylesheet.
5. `styles-ios26-liquid-glass.css`: component selectors that consume those tokens.
6. `styles-form-ux.css`: final form-control refinements.

Changing this order can change the cascade even when no selector changes. Treat import reordering as a visual change and run the style-contract check.

## Token ownership

- New shared iOS 26 / Liquid Glass material values belong in `src/styles-ios26-tokens.css`.
- Component rules and state selectors belong in `src/styles-ios26-liquid-glass.css`.
- Page-specific styles belong beside their page (for example, `src/pages/Home.vibe.css`).
- Legacy root variables in older global stylesheets remain for compatibility during the phased migration. Do not add new global theme values to those older files unless a page or compatibility case requires it.

## Cascade rules

- Scope page-specific styling to a page root rather than globally changing `body`, `.card`, `.glow`, or `.app-bg`.
- Never hide or paint over the shared wallpaper layer from a theme-wide selector. Wallpaper image, blur, and brightness are controlled by the App's inline style and user preference.
- Avoid appending a second copy of a selector to override a previous appended patch. Update the owning rule when practical.
- Avoid `!important` for ordinary component styling. Reserve it for a documented cross-theme or third-party override that cannot be expressed through scope or order.
- Do not introduce broad `body:has(...)` overrides when a page-scoped root selector can express the same behavior.

## Migration scope

Phase 1 only extracts the active iOS 26 material token block and documents the cascade contract. It deliberately leaves the legacy theme and page selectors in place, preserving the current visual output. Later phases can migrate duplicate component selectors one page family at a time with screenshots and browser checks.
