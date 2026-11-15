# Qianzhi Design System

> Status: Active design specification  
> Version: 1.0  
> Last reviewed: 2026-11-15  
> Project: Qianzhi / 堯  
> Stack: React, TypeScript, Vite  
> Repository: https://github.com/2407734521m-lgtm/qznb

This document defines the shared visual and interaction language for Qianzhi. It is an implementation reference for developers and AI coding agents. It describes how the product should look and behave; it does not authorize unrelated functional changes.

## 1. Product design direction

Qianzhi is a multi-area web ecosystem. Its surfaces have different jobs and may use different visual treatments. The system is **cohesive, not monochromatic**.

The public-facing site uses a white-first, minimal foundation. Messaging, administration, music playback, the Dynamic Island and the Dock may use their own carefully defined surface treatments. Each area should feel purpose-built while retaining shared rules for typography, spacing, interaction quality, accessibility and motion.

### Design principles

1. **Function before ornament.** Every visual effect must support hierarchy, feedback, orientation or comprehension.
2. **Minimal, not empty.** Remove repetition and clutter without hiding useful information or weakening navigation.
3. **Multiple themes, one system.** White is the default public-site canvas, not a requirement that every surface be white.
4. **Consistent behavior.** Buttons, inputs, menus, dialogs, loading states and feedback should behave predictably.
5. **Mobile is a first-class target.** Layouts must work on narrow Android and iOS viewports, including safe areas and touch input.
6. **Preserve the product.** A visual refactor must not silently remove features, change permissions, alter data contracts or change navigation behavior.
7. **No generic AI styling.** Avoid gratuitous gradients, arbitrary pastel cards, decorative blobs, excessive pill controls and repeated icon-card grids.

## 2. Reference basis and evidence

### Project references

- Live site inspected: https://qianzhi.pw
- Repository overview: https://github.com/2407734521m-lgtm/qznb
- Design-reference collection: https://github.com/VoltAgent/awesome-design-md
- Apple reference: https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md
- Intercom reference: https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/intercom/DESIGN.md
- Linear reference: https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md
- Notion reference: https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/notion/DESIGN.md

The reference projects are pattern sources, not visual identities to copy. Borrow Apple’s whitespace and typographic restraint, Intercom’s conversational information hierarchy, Linear’s precise component states and density, and Notion’s content organization. Do not import their brand colors, proprietary fonts or complete page compositions.

### Live-site inspection notes

The public homepage was fetched on 2026-11-15 and returned HTTP 200. The inspected page structure included a site header, primary navigation, introductory hero, shortcut links, latest-post feed, announcements area, sign-in call-to-action and footer. The repository README identifies React, TypeScript and Vite as the frontend stack, with Supabase services for application data and authentication.

The live extraction surfaced legacy brand labels and a brown accent in the current guest-page markup. Treat those as observations of the captured page, **not approved product positioning or required design tokens**. Do not use legacy archive/classroom wording as a design premise.

The page’s HTML/DOM and automated branding extraction were inspected. A screenshot was requested, but its image pixels could not be independently reviewed in this capture. Exact current CSS values, spacing measurements, hover states and all responsive breakpoints have therefore not been certified. Token values below are proposed design decisions, not claims of exact values extracted from production. Verify them against the actual source styles and browser rendering before implementation.

## 3. Shared foundations

### 3.1 Color roles

Use semantic tokens rather than hard-coded colors inside components. These values establish a neutral base; area-specific themes may override surface and accent tokens.

| Token | Proposed value | Role |
|---|---|---|
| `--qz-canvas` | `#FFFFFF` | Default public-site canvas |
| `--qz-surface` | `#FFFFFF` | Standard content surface |
| `--qz-surface-subtle` | `#F6F7F8` | Quiet secondary surface |
| `--qz-surface-hover` | `#F1F3F5` | Hover / selected neutral |
| `--qz-ink` | `#20242A` | Primary text |
| `--qz-ink-secondary` | `#555D68` | Secondary text |
| `--qz-ink-muted` | `#737B86` | Supporting text |
| `--qz-border` | `#E7EAEE` | Standard divider and border |
| `--qz-border-strong` | `#D5DAE0` | Emphasized border |
| `--qz-action` | `#252A31` | Default primary action |
| `--qz-action-hover` | `#3A414A` | Primary action hover |
| `--qz-focus` | `#4776B8` | Focus indicator |
| `--qz-success` | `#23845B` | Success state |
| `--qz-warning` | `#A96F19` | Warning state |
| `--qz-danger` | `#C44747` | Error / destructive state |

Color rules:

- The public site defaults to white with restrained neutral supporting surfaces.
- Color is allowed where it conveys brand, feature identity, status, media atmosphere or interaction state.
- Do not force every page, panel or component onto a white surface.
- Do not introduce a site-wide saturated blue/green palette or a global decorative gradient.
- Do not use success, warning or danger colors as decoration.
- Check text and icon contrast against every area theme.

### 3.2 Typography

Use the existing system stack unless repository inspection confirms an already licensed and consistently loaded typeface:

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  "Noto Sans SC",
  "PingFang SC",
  "Microsoft YaHei",
  sans-serif;
```

| Role | Desktop target | Weight | Use |
|---|---:|---:|---|
| Display | 36–44px | 600 | Major page introduction |
| H1 | 30–34px | 600 | Main page title |
| H2 | 23–26px | 600 | Section title |
| H3 | 19–21px | 600 | Card / panel title |
| Body | 14–16px | 400 | Main reading |
| Supporting | 13–14px | 400 | Metadata and descriptions |
| Caption | 12px minimum where practical | 400 | Secondary metadata |

Use comfortable line-height: approximately 1.15–1.25 for headings and 1.45–1.65 for body text. Scale display and heading sizes down on narrow screens. Do not use tiny text to force more content into a component.

### 3.3 Spacing, geometry and elevation

Use a 4px base rhythm:

- 4px: icon/text micro-gap
- 8px: compact control spacing
- 12px: related inline content
- 16px: standard component padding
- 24px: card groups and section spacing
- 32px: major content grouping
- 48px: large section separation

Suggested radius roles:

- 8px: compact inputs and utility controls
- 12px: standard cards and menus
- 16px: larger panels and media cards
- 20px: prominent feature surfaces
- Full pill: only for chips, compact status markers or controls whose shape benefits from it

Use borders before shadows. Shadows should be soft, shallow and reserved for floating layers that need separation. Avoid stacking several shadows or wrapping every item in a card.

## 4. Area-specific visual systems

These are coordinated sub-systems, not unrelated themes. They share typography, spacing, focus behavior, accessibility and component state conventions.

### 4.1 Main site: home, feed, daily, confession wall and announcements

- Default canvas: white.
- Secondary panels: very light neutral surfaces.
- Primary text: charcoal; metadata uses muted neutral text.
- Keep page hierarchy clear: page title, concise description, content and relevant actions.
- Feed items should prioritize author, timestamp, visibility, content and interaction counts.
- Avoid turning every shortcut into a large decorative card. Use compact, purposeful navigation patterns.
- Guest restrictions and login prompts must be understandable and visually secondary to the content.
- Empty states should explain what is absent and offer a relevant next action without inventing engagement metrics.
- Preserve the existing navigation destinations and guest/member permissions.

### 4.2 Member profiles and social interactions

- Prioritize identity, profile information, posts and relationships.
- Separate primary profile actions from secondary settings.
- Use consistent metadata, privacy labels and status markers.
- Anonymous content must remain visually distinguishable without exposing private identity.
- Use restrained accents for interaction states; never rely on color alone to communicate privacy or account status.

### 4.3 Private messaging

Messaging is a specialized conversational interface.

- Conversation canvas may use a subtle cool neutral rather than pure white.
- Received bubbles use a quiet gray surface; sent bubbles may use a restrained blue-tinted surface.
- Keep message text readable and bubbles compact, with consistent max-width and spacing.
- Distinguish delivery, read, typing, online, voice-call and attachment states clearly.
- Long-press menus, dialogs, input controls and media previews must use the site’s custom interaction components.
- Wallpaper selection must visibly apply to the conversation surface and preserve sufficient text contrast.
- Avoid excessive blur on message content. Glass treatment belongs to floating controls or explicitly designed overlays, not every bubble.
- Preserve conversation, read-state and realtime behavior.

### 4.4 Administration

The admin interface is a professional management workspace, not a marketing landing page.

- Use a neutral canvas and a clear distinction between navigation, workspace, panels and detail views.
- Support denser tables and forms without reducing text below comfortable sizes.
- Use consistent status badges, filter controls, empty states, confirmation dialogs and destructive-action styling.
- Keep high-priority account/security states visually explicit and accessible.
- Prefer custom in-app dialogs, menus and selectors over browser-native prompts.
- Do not let admin-only visual changes leak into ordinary member pages.

### 4.5 Music space

Music may use a distinct dark, immersive visual system.

- Proposed base surfaces: near-black charcoal and layered dark gray, not pure black everywhere.
- Use high-contrast text and clearly differentiated playback controls.
- Album art may influence local artwork presentation, but must not redefine global site colors.
- Playback progress, volume, queue, active track and unavailable metadata need clear states.
- Motion should support playback state and beat/level visualization without distracting from controls.
- Keep the music space’s theme scoped to its own route and components.

### 4.6 Dynamic Island

The Dynamic Island is a floating, stateful component with its own visual grammar.

- Use a dark translucent capsule or carefully tuned glass surface where contrast remains sufficient.
- Glass, blur, highlight and displacement effects must remain scoped to the island and related floating overlays.
- Expansion, collapse, minimized, active-call and media states must be visibly distinct.
- Tapping a minimized island should reopen it; gesture behavior must not be the only way to recover it.
- Preserve the existing configurable position and dimension behavior.
- Respect safe areas and avoid covering page controls or important content.
- Progress, percentage and visualizer content must remain legible and fully visible.

### 4.7 Dock

The Dock is a dedicated navigation surface and may use a floating translucent/glass treatment.

- Keep its icon, label, active and pressed states coherent with the overall system.
- Distinguish it from a browser-native bottom bar.
- Ensure it remains usable on narrow screens and does not obscure page content.
- Apply area-specific surface and blur tokens rather than globally changing page backgrounds.
- The Dock may be iterated as a component; changes should be deliberate and reviewed in context rather than inherited accidentally from unrelated page styling.

## 5. Component standards

### Buttons

Define primary, secondary, tertiary and destructive variants. Each must have default, hover, pressed, disabled and focus states. Keep labels action-oriented. Avoid duplicate buttons that trigger the same action in the same visual group.

### Cards and panels

Use cards only when grouping improves comprehension. Prefer a clean surface, a subtle border and consistent padding. Do not place cards inside cards without a clear hierarchy. Interactive cards need an unmistakable hover and focus treatment.

### Inputs and selectors

Use persistent labels, clear validation, sensible input heights and visible focus states. Use in-app selectors and dialogs; do not introduce browser-native prompt, confirm, alert or native-select UI as a shortcut.

### Dialogs, menus and toasts

Use a consistent overlay layer, focus management, escape behavior where appropriate, and clear close/cancel actions. Destructive actions require an explicit, understandable confirmation. Toasts should be brief and must not be the only place an important error is explained.

### Icons and assets

Use one coherent icon family and consistent stroke weight. Avoid mixing emoji, unrelated icon packs and hand-drawn symbols within the same navigation group. Use supplied project assets where appropriate and verify licensing before adding third-party assets.

## 6. Motion and feedback

Motion communicates a state transition; it is not decoration.

Suggested starting ranges (tune through device testing):

| Interaction | Duration |
|---|---:|
| Button press / hover | 120–180ms |
| Small menu | 160–220ms |
| Dialog | 180–260ms |
| Page / panel transition | 200–320ms |
| Island expansion | 220–360ms |

Use easing that starts promptly and settles smoothly. Avoid overshoot that makes controls feel unstable, long sequences that delay use, continuous animation without informational value, and layout shifts that move content unexpectedly.

Support `prefers-reduced-motion`. Reduced-motion mode should retain state clarity while minimizing translation, scaling and looping effects.

## 7. Responsive behavior

- Build mobile-first and verify narrow Android and iOS widths.
- Respect `env(safe-area-inset-*)` where fixed or floating UI approaches screen edges.
- Prevent horizontal overflow and clipped controls.
- Reflow desktop columns into readable mobile sections; do not merely shrink them.
- Keep touch targets comfortably usable (aim for approximately 44px where practical).
- Ensure dialogs fit within the visible viewport and remain scrollable when necessary.
- Validate both portrait and landscape for media-related interfaces.
- Desktop layouts should use deliberate content widths instead of stretching every text region across the full screen.

Responsive breakpoints should follow actual content constraints and the existing project conventions; do not introduce arbitrary competing breakpoint systems.

## 8. Accessibility and resilience

- Maintain adequate contrast in every theme and state.
- Provide keyboard-visible focus and semantic control labels.
- Give icon-only controls accessible names.
- Do not communicate status through color alone.
- Preserve text zoom and avoid fixed heights that clip translated or enlarged content.
- Handle loading, empty, error, offline and permission-denied states.
- Ensure important actions remain discoverable without hover or gesture-only interaction.

## 9. Design guardrails for AI and contributors

Before changing a page or component:

1. Read this document and identify the relevant area-specific system.
2. Inspect the existing component, styles and behavior before adding new ones.
3. Reuse existing tokens and components where they genuinely fit.
4. Search for duplicate or conflicting CSS before introducing overrides.
5. Keep changes scoped; do not alter unrelated pages or themes.
6. Preserve routes, permissions, data contracts and existing functionality unless the task explicitly requests a functional change.
7. Check mobile and desktop states, including loading, empty, error and pressed/focus states.
8. Run the project’s available checks.

This document is a **design constraint, not a ban on new ideas**. A new visual pattern or feature may be proposed when it solves a real product need. If it introduces a new visual language, document its tokens, states and relationship to the shared system before spreading it to other areas.

Do not infer permission to redesign or remove a feature from this document alone. Functional scope comes from the specific task.

## 10. Implementation and validation

The repository README documents these checks:

```bash
npm run typecheck
npm run build
npm run check:styles
npm run check:admin-styles
```

Run relevant checks after implementation. A successful build does not replace visual inspection. Verify production behavior separately from local or preview behavior.

## 11. Open items for future visual QA

The following require direct source inspection and browser validation before implementation values are treated as final:

- Confirm computed styles and current CSS token locations.
- Capture and inspect desktop and mobile screenshots of key authenticated and guest states.
- Verify the final public-site accent colors and status palette.
- Verify chat wallpaper, bubble and call states on real mobile viewports.
- Verify admin tables, forms and security-status states.
- Verify the music player in portrait and landscape.
- Verify Dynamic Island and Dock interactions, safe-area behavior and reduced-motion mode.

Until those checks are performed, numerical tokens in this document are proposed standards and may be adjusted through reviewed design work.
