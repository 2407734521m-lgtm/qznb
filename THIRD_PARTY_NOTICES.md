# Open-source attributions

This file records third-party code and design references used by the administrator workspace.

## Magic UI — NumberTicker / Marquee / ShimmerButton

- Repository: https://github.com/magicuidesign/magicui
- Adapted sources: `apps/www/registry/magicui/number-ticker.tsx`, `apps/www/registry/magicui/marquee.tsx`, `apps/www/registry/magicui/shimmer-button.tsx`
- Local adaptations:
  - `src/components/fx/NumberTicker.tsx` — shared number ticker (framer-motion spring, zh-CN formatting, reduced-motion jumps straight to the final value); `src/components/admin/AdminNumberTicker.tsx` is only a thin wrapper around it, keeping the admin `admin-number-ticker` class.
  - `src/components/fx/Marquee.tsx` + `src/components/fx/fx.css` — marquee rewritten in site CSS (repeated content, CSS translate loop, pause on hover, reduced-motion stops the animation and keeps a single scrollable copy).
  - `src/components/fx/ShimmerButton.tsx` + `src/components/fx/fx.css` — shimmer button rewritten in site CSS (button face reuses the site primary-button gradient; a conic-gradient light travels around the border; reduced-motion and disabled states stop the shimmer). Used only on the primary publish button in the shared composer (`src/components/PostList.tsx`, serving Feed / Daily).
- License: MIT (full text below)
- Changes: adapted to the existing React + Framer Motion dependency, Chinese number formatting, local reduced-motion preference, and qznb visual styles (cold-white paper tokens: #f7f8f8 / #ffffff / #1f2a3a / #7a8894 / #e5e8ea / #b0404f). No Tailwind, no magicui package installed.

MIT License

Copyright (c) Magic UI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## scaffold-master

- Repository: https://github.com/wbr664393425-lgtm/scaffold-master
- License: MIT
- Adapted concepts: grouped application shell, fixed/collapsible sidebar, topbar, command palette, dashboard bento layout, compact metrics, and panel hierarchy.
- Implementation: reworked for qznb's React + TypeScript + Supabase architecture; Vue, Spring Boot, MySQL, and Redis runtime code was not imported.

MIT License

Copyright (c) 2026 wbr664393425-lgtm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Other references evaluated

- React Bits: https://github.com/DavidHDev/react-bits — its MIT + Commons Clause terms were reviewed; no component source was copied into this phase.
- Anime.js: https://github.com/juliangarnier/anime — no additional animation package was introduced; the existing Framer Motion dependency is used for page transitions and counters.
- Motion Sites, Uiverse, and Aceternity UI were treated as visual/interaction references only in this phase. No source files were copied from them.

## Liquid Glass dependency

- `simple-liquid-glass` 5.7.0 — https://github.com/lucaperullo/simple-liquid-glass — MIT. Used as an npm dependency for the React liquid-glass navigation and Dock surfaces; no upstream source files were copied into this repository.

- `webgl-liquid-glass` source — https://github.com/clayharmon/webgl-liquid-glass — MIT. Adapted and vendored under `src/components/liquid-glass-dock/`; upstream source files retain attribution headers, and the full MIT license is included above.

MIT License

Copyright (c) 2026 Clay Harmon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Chat liquid-glass optical filter

- Repository: https://github.com/dpawlikowski/liquid-glass
- License: MIT
- Adaptation: the chat page uses the upstream CSS/SVG liquid-glass technique (SVG `feTurbulence` + `feDisplacementMap` and a live `backdrop-filter` reference). The filter parameters and all page styling were adjusted for a white canvas, mobile performance, and qznb's existing chat markup. No upstream React runtime or package dependency was added.

MIT License

Copyright (c) 2026 liquid-glass contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
