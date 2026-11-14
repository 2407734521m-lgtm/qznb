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

## Starter Blog — longform timeline layout

- Repository: https://github.com/timlrx/tailwind-nextjs-starter-blog
- Stars / license verified 2026-11-14 via the GitHub API: 10,554 stars, MIT License.
- Borrowed layout ideas only (from `layouts/PostLayout.tsx`): date meta above a large title, author row (avatar + name), prose body line-height with a comfortable reading measure, meta info arranged in a side column on wide screens, and hairline dividers before tags / comments.
- Local rewrites (no upstream code copied, no Tailwind, no new dependency):
  - `src/pages/Board.starterblog.css` — announcement board longform: cold-white paper, 17px / 800 titles, 15px / 1.85 body, 68ch measure, admin announcements with a seal-red left rule and a desktop meta sidebar.
  - `src/pages/Timeline.starterblog.css` — timeline: cold-white spine and seal-red node dots, year section headings with hairline rules, date meta lines, longform title / body.
  - `src/components/PostList.longform.css` — shared long-post prose for Feed / Daily (same 15px / 1.85 body, meta author row, hairline dividers above actions and comments).
- License: MIT (full text below)

MIT License

Copyright (c) 2021-2025 Timothy Lin

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

## Aceternity UI — 3D 倾斜卡（效果思路）

- 来源：https://ui.aceternity.com（3D Card Effect；免费组件约 100+ 个，Tailwind + Motion 构建）
- 许可：自定义许可，无公开组件仓库（组件以 copy-paste / shadcn registry 分发，无 npm 包）；免费组件可用于自己或客户的最终产品，不得转售或再分发源码。2026-11-14 按官网口径核对。
- 本地实现（全部自写，上游代码一行没抄，无 Tailwind、无新依赖）：
  - `src/components/fx/TiltCard.tsx` + `src/components/fx/TiltCard.css` — `useTiltCard()`：沿用站内已有的 framer-motion（MotionValue + useSpring 平滑），透视 900px、倾斜幅度仅 ±4°（原版深色大光晕 + 大幅度不适合本站，改成冷白纸面弱光晕：白色径向渐变最高 0.16 透明度）。
  - 只在发现页第一张卡「指尖生花」试点（`src/pages/Explore.tsx`），其余卡片、Dock、点击/跳转行为一律不动。
  - 触摸降级：只在细指针 + 可悬停设备上启用（`(hover: hover) and (pointer: fine)`），且只响应鼠标指针；触摸设备完全不倾斜、不注册触摸处理、不挡点击与滚动。
  - 减弱动效：`prefers-reduced-motion` 时倾斜与光晕全关（组件内 `useReducedMotion` 判断 + CSS 兜底）。
- License: 无上游代码复制，故不附上游许可全文；效果思路来源见上。
