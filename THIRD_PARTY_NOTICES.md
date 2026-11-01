# Open-source attributions

This file records third-party code and design references used by the administrator workspace.

## Magic UI — NumberTicker

- Repository: https://github.com/magicuidesign/magicui
- Adapted source: `apps/www/registry/magicui/number-ticker.tsx`
- Local adaptation: `src/components/admin/AdminNumberTicker.tsx`
- License: MIT
- Changes: adapted to the existing React + Framer Motion dependency, Chinese number formatting, local reduced-motion preference, and qznb visual styles.

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

No additional runtime dependency was added in this phase.
