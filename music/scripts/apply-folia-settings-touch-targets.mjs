import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, content) => writeFile(path, content, 'utf8');
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Settings touch targets overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Settings touch targets overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

// The settings kit was drawn for a mouse: close button 32px, tabs 36px, side-list rows and
// search field 32px, kit buttons 32px and quiet ones 24px. On a coarse pointer (a phone) every
// one of those is below the 44px touch target. They grow to 44px only under (pointer: coarse)
// via Tailwind's pointer-coarse variant, so the desktop layout does not change at all.
// The search clear button is the worst of the lot — a bare 14px icon with no hit area — so it
// gets a real 32px box on desktop and 44px on touch as well.

// 14. Settings kit: close button, tabs, side list, search field, kit buttons.
const pageHeaderPath = resolve(root, 'src/components/modal/settings/kit/PageHeader.tsx');
let pageHeader = await read(pageHeaderPath);
pageHeader = replaceOnce(pageHeader,
    'className="st-t-fast grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[color:var(--st-t2)] transition-colors hover:bg-[var(--st-fill)] hover:text-[color:var(--st-t1)]"',
    'className="st-t-fast grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[color:var(--st-t2)] transition-colors hover:bg-[var(--st-fill)] hover:text-[color:var(--st-t1)] pointer-coarse:h-11 pointer-coarse:w-11"',
    'settings close button');
await write(pageHeaderPath, pageHeader);

const tabsPath = resolve(root, 'src/components/modal/settings/kit/Tabs.tsx');
let tabs = await read(tabsPath);
tabs = replaceOnce(tabs,
    'relative -mx-1 h-9 shrink-0 whitespace-nowrap',
    'relative -mx-1 h-9 pointer-coarse:h-11 shrink-0 whitespace-nowrap',
    'settings tab button');
tabs = replaceOnce(tabs,
    '<div className="flex h-9 shrink-0 items-center self-end pl-3">',
    '<div className="flex h-9 pointer-coarse:h-11 shrink-0 items-center self-end pl-3">',
    'settings tabs action');
await write(tabsPath, tabs);

const sideListPath = resolve(root, 'src/components/modal/settings/navigation/SettingsSideList.tsx');
let sideList = await read(sideListPath);
sideList = replaceOnce(sideList,
    'className={`flex h-8 w-full shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 text-left text-[13px] transition-colors ',
    'className={`flex h-8 pointer-coarse:h-11 w-full shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 text-left text-[13px] transition-colors ',
    'settings side-list row');
await write(sideListPath, sideList);

// 0.7.29 moved the settings search field (and its clear button) out of SettingsSideList.tsx
// into its own SettingsSearchField.tsx, shared by the wide side list and the compact top bar.
const searchFieldPath = resolve(root, 'src/components/modal/settings/navigation/SettingsSearchField.tsx');
let searchField = await read(searchFieldPath);
searchField = replaceOnce(searchField,
    'className={`flex h-8 items-center gap-2 rounded-lg border border-transparent bg-[var(--st-fill)] px-2.5 text-[color:var(--st-t3)] transition-colors focus-within:border-[var(--st-line2)] ${className}`}',
    'className={`flex h-8 pointer-coarse:h-11 items-center gap-2 rounded-lg border border-transparent bg-[var(--st-fill)] px-2.5 text-[color:var(--st-t3)] transition-colors focus-within:border-[var(--st-line2)] ${className}`}',
    'settings search field');
searchField = replaceOnce(searchField,
    'className="shrink-0 transition-colors hover:text-[color:var(--st-t1)]"',
    'className="grid h-8 w-8 shrink-0 place-items-center transition-colors hover:text-[color:var(--st-t1)] pointer-coarse:h-11 pointer-coarse:w-11"',
    'settings search clear button');
await write(searchFieldPath, searchField);

const buttonPath = resolve(root, 'src/components/modal/settings/kit/Button.tsx');
let button = await read(buttonPath);
button = replaceOnce(button,
    "fill: 'h-8 rounded-lg bg-[var(--st-fill)] px-3 text-[13px] text-[color:var(--st-t1)] enabled:hover:bg-[var(--st-fill2)]',",
    "fill: 'h-8 pointer-coarse:h-11 rounded-lg bg-[var(--st-fill)] px-3 text-[13px] text-[color:var(--st-t1)] enabled:hover:bg-[var(--st-fill2)]',",
    'kit text fill button');
button = replaceOnce(button,
    "primary: 'h-8 rounded-lg bg-[var(--st-accent)] px-3 text-[13px] text-[color:var(--st-on-accent)] enabled:hover:opacity-90',",
    "primary: 'h-8 pointer-coarse:h-11 rounded-lg bg-[var(--st-accent)] px-3 text-[13px] text-[color:var(--st-on-accent)] enabled:hover:opacity-90',",
    'kit text primary button');
button = replaceOnce(button,
    "quiet: 'h-6 rounded-md px-1.5 text-xs text-[color:var(--st-t2)] enabled:hover:bg-[var(--st-fill)] enabled:hover:text-[color:var(--st-t1)]',",
    "quiet: 'h-6 pointer-coarse:h-11 rounded-md px-1.5 text-xs text-[color:var(--st-t2)] enabled:hover:bg-[var(--st-fill)] enabled:hover:text-[color:var(--st-t1)]',",
    'kit text quiet button');
button = replaceOnce(button,
    "fill: 'h-8 w-8 rounded-lg bg-[var(--st-fill)] text-[color:var(--st-t2)] enabled:hover:bg-[var(--st-fill2)] enabled:hover:text-[color:var(--st-t1)] disabled:bg-transparent',",
    "fill: 'h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 rounded-lg bg-[var(--st-fill)] text-[color:var(--st-t2)] enabled:hover:bg-[var(--st-fill2)] enabled:hover:text-[color:var(--st-t1)] disabled:bg-transparent',",
    'kit icon fill button');
button = replaceOnce(button,
    "primary: 'h-8 w-8 rounded-lg bg-[var(--st-accent)] text-[color:var(--st-on-accent)] enabled:hover:opacity-90',",
    "primary: 'h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 rounded-lg bg-[var(--st-accent)] text-[color:var(--st-on-accent)] enabled:hover:opacity-90',",
    'kit icon primary button');
button = replaceOnce(button,
    "quiet: 'h-6 w-6 rounded-md text-[color:var(--st-t2)] enabled:hover:bg-[var(--st-fill)] enabled:hover:text-[color:var(--st-t1)]',",
    "quiet: 'h-6 w-6 pointer-coarse:h-11 pointer-coarse:w-11 rounded-md text-[color:var(--st-t2)] enabled:hover:bg-[var(--st-fill)] enabled:hover:text-[color:var(--st-t1)]',",
    'kit icon quiet button');
await write(buttonPath, button);

// 16. Search rows: the narrow-screen row action was 30px, and the cover play mark only
// appeared on hover, so on a touch screen it was invisible. Row actions go back to 44px
// on narrow screens and on any coarse pointer; the play mark stays half-visible where
// there is no hover to reveal it.
const searchCssPath = resolve(root, 'src/components/app/search/search.css');
let searchCss = await read(searchCssPath);
searchCss = replaceOnce(searchCss,
    '    .search-row-action { width: 30px; height: 30px; }',
    '    .search-row-action { width: 44px; height: 44px; }',
    'narrow search row action');
searchCss = replaceOnce(searchCss,
    `    .search-row-action { opacity: 0; }
    .search-row:hover .search-row-action,
    .search-row:focus-within .search-row-action { opacity: 0.7; }
}`,
    `    .search-row-action { opacity: 0; }
    .search-row:hover .search-row-action,
    .search-row:focus-within .search-row-action { opacity: 0.7; }
}

/* Touch pointers get the full 44px row action, and the cover play mark stays visible: with
   no hover there is no other way to learn the cover is a button. */
@media (pointer: coarse) {
    .search-row-action { width: 44px; height: 44px; }
}

@media (hover: none) {
    .search-row-play { opacity: 0.85; }
}`,
    'touch search row actions');
await write(searchCssPath, searchCss);

console.log('Applied settings touch targets: kit controls reach 44px on coarse pointers, search row actions return to 44px and the cover play mark stays visible without hover.');
