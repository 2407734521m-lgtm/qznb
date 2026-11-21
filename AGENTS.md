# AGENTS.md

Working notes for AI coding agents in this repository. Keep changes scoped and verified; do not redesign or remove features on your own initiative.

## Design

- Before changing any page or component, read `DESIGN.md` (Qianzhi Design System v1.0) and identify the relevant area system (§4) and component standard (§5).
- Main site: white-first, minimal foundation. Messaging, admin, music, Dynamic Island and Dock keep their own visual systems; they share typography, spacing, interaction feedback and motion rules.
- Reuse existing tokens and components. Search for duplicate or conflicting CSS before adding overrides. Do not hard-code a new palette or introduce a competing breakpoint system.
- A visual change must not remove features, change permissions, alter data contracts, or change navigation behavior. Functional scope comes from the task, never from this file or `DESIGN.md` alone.

## Checks

Run the relevant checks after implementation:

```bash
npm run typecheck
npm run build
npm run check:styles
npm run check:admin-styles
```

A green build does not replace visual inspection; verify on mobile and desktop viewports.

## Data and permissions

- New database changes go in a separate, time-ordered SQL migration under `supabase/migrations`; review RLS and rollback impact first.
- New objects created by `postgres` in the exposed `public` schema have secure defaults: no client grants are inherited, and the global PostgreSQL default `PUBLIC EXECUTE` grant for new functions is revoked. For each new table, explicitly enable RLS and grant only the required operations to `authenticated` or `anon`; for each new RPC, explicitly grant execution to the intended role. Public endpoints must be deliberate and input-bounded.
- Every `SECURITY DEFINER` function must use an empty/fixed `search_path`, schema-qualify referenced objects, and enforce its caller/ownership authorization inside the function body.
- Never put service-role keys, Resend API keys or other server secrets in frontend code or commits.
- Production state is decided by GitHub Actions and Supabase, not by a merged PR alone.

See `README.md` for the project overview and local setup.
