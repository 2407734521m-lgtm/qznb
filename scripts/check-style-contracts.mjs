import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const styles = read('../src/styles-ios26-liquid-glass.css');
const login = read('../src/pages/Login.tsx');
const loginStyles = read('../src/pages/Login.polish.css');
const loginBackdrop = read('../src/styles-liquid-backdrop.css');
const visualRules = read('../src/styles-visual-rules.css');
const premiumStyles = read('../src/styles-premium.css');
const cinematicStyles = read('../src/styles-cinematic.css');
const homePageStyles = read('../src/pages/Home.vibe.css');
const meHubStyles = read('../src/pages/MeHub.polish.css');
const tokens = read('../src/styles-ios26-tokens.css');
const mainEntry = read('../src/main.tsx');
const wallpaper = read('../src/lib/wallpaper.ts');
const app = read('../src/App.tsx');
const home = read('../src/pages/Home.tsx');
const homeCss = read('../src/pages/Home.vibe.css');
const baseStyles = read('../src/styles.css');
const editorialStyles = read('../src/styles-editorial.css');

function assert(condition, message) {
  if (!condition) {
    console.error(`Style contract failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(/--visual-bg:\s*#ffffff/.test(tokens), 'the site canvas default must stay white');
assert((tokens.match(/:root\s*\{/g) || []).length === 1, 'canonical material tokens must use one root block');
assert(tokens.includes('--visual-bg: #ffffff;') && tokens.includes('--bg: #ffffff;'), 'canonical material tokens must preserve the white default canvas');
assert(!styles.includes('--qz26-ink:'), 'component CSS must not redefine canonical material tokens');
const tokenImport = mainEntry.indexOf("import './styles-ios26-tokens.css';");
const materialImport = mainEntry.indexOf("import './styles-ios26-liquid-glass.css';");
const formImport = mainEntry.indexOf("import './styles-form-ux.css';");
assert(tokenImport >= 0 && materialImport > tokenImport && formImport > materialImport, 'material tokens must load before material components and form refinements');
assert(/html, body, #root\s*\{[^}]*background:\s*#ffffff\s*!important/s.test(styles), 'the document canvas must stay white');
assert(/\.glow\s*\{[^}]*background:\s*transparent\s*!important/s.test(styles), 'the glow layer must not cover the wallpaper');
assert(!/\.app-bg(?:\.qz-ios26-backdrop)?\s*\{[^}]*background(?:-image)?\s*:[^;]*!important/s.test(styles), 'global CSS must not override the app wallpaper layer');
assert(wallpaper.includes("return { src: '#ffffff', kind: 'grad', blur: 0, dark: 0 };"), 'fresh installs must use a white default canvas');
assert(wallpaper.includes("return { src: 'default', kind: 'img', blur: 0, dark: 0 };"), 'an explicitly saved default wallpaper must be restored');
assert(app.includes('className="app-bg qz-ios26-backdrop"') && app.includes('filter: `blur(${wp.blur}px) brightness(${100 - wp.dark}%)`'), 'the app must retain dynamic wallpaper and filter bindings');
assert((home.includes('className="vh-load-state"') || home.includes('FeedSkeleton')) && home.includes('className="vh-load-error"'), 'the homepage must expose loading and error states');
assert(home.includes('setReloadKey(value => value + 1)'), 'the homepage error state must offer a retry action');
assert(home.includes('<Link') && homeCss.includes('.vh-hero:focus-visible') && homeCss.includes('.vh-feed-row:focus-visible'), 'homepage navigation links must have visible keyboard focus');
assert(/body:has\(\.vibe-home\)\s*\{[^}]*background:\s*#ffffff\s*!important/s.test(homeCss), 'the homepage canvas must stay white');
assert(!/body:has\(\.vibe-home\)\s+\.app-bg[^}]*display:\s*none\s*!important/s.test(homeCss), 'the homepage must not hide the user wallpaper layer');
assert(!/\.glow\s*,\s*\.app-bg\s*\{[^}]*display:\s*none\s*!important/s.test(baseStyles), 'the base white theme must not hide the wallpaper layer');
assert(!/\.glow\s*,\s*\.app-bg\s*\{[^}]*display:\s*none\s*!important/s.test(editorialStyles), 'the editorial theme must not hide the wallpaper layer');
assert(!/\.app-bg\s*\{[^}]*filter\s*:[^;]*!important/s.test(editorialStyles), 'the editorial theme must not override user blur or brightness settings');
assert(!/body\s*\{[^}]*background(?:-image|-color)?\s*:/s.test(baseStyles), 'the base stylesheet must not reintroduce a page wallpaper');
assert(!/\.app-bg\s*\{[^}]*filter\s*:/s.test(baseStyles), 'wallpaper blur and brightness must come only from user settings');
assert(!/background\s*:\s*#071b2a|background(?:-color)?\s*:\s*#06101f/i.test(baseStyles), 'the retired deep-sea canvas must be removed');
assert(!/(?:background|background-image)\s*:/i.test(editorialStyles), 'the legacy editorial stylesheet must be layout-only');
assert(!/color-scheme\s*:\s*dark|--visual-bg\s*:\s*#171614/i.test(visualRules), 'legacy warm/dark visual tokens must not compete with canonical tokens');
assert(!/\.glow\s*\{[^}]*background\s*:/s.test(premiumStyles), 'the premium layer must not add an obsolete global wallpaper');
assert(!/\.glow\s*\{[^}]*background\s*:/s.test(cinematicStyles), 'the cinematic layer must not add an obsolete global wallpaper');
assert(!/\.login-wrap::before\s*\{[^}]*background\s*:/s.test(cinematicStyles), 'the login page must not retain an obsolete full-screen overlay');
assert(!/\.admin-shell\s*\{[^}]*background\s*:/s.test(premiumStyles), 'the premium layer must not paint over the admin scaffold canvas');
assert(!login.includes("from '../assets/cow.jpg'"), 'the retired bundled cow wallpaper must not be loaded');
assert(login.includes('LEGACY_DEFAULT_BACKGROUND') && login.includes('return LEGACY_DEFAULT_BACKGROUND.test(saved) ? DEFAULT_BG : saved;'), 'legacy stock wallpaper values must migrate to white while user selections remain');
assert(login.includes('bg && <div className="login-bg"') && login.includes('setBg(c.toDataURL'), 'user-uploaded login wallpapers must remain supported');
assert(!loginBackdrop.includes('flow-bg.webp') && !loginBackdrop.includes('qz-flow-drift'), 'the retired stock flow image and animation must be removed');
assert(/\.login-flow\s*\{[^}]*background:\s*var\(--visual-bg,\s*#ffffff\)/s.test(loginBackdrop), 'the default login backdrop must use the white canvas');
assert(!/\.login-card\s*\{[^}]*background\s*:/s.test(loginStyles), 'login layout refinements must not paint over the canonical login material');
assert((baseStyles.match(/\.gpick-head\s*\{/g) || []).length === 1, 'duplicate game-picker heading rules must be removed');
assert((baseStyles.match(/\.priv-note\s*\{/g) || []).length === 1, 'duplicate privacy-note rules must be removed');
assert(!/body:has\(\.me-hub\)[^{]*\{[^}]*background\s*:/s.test(meHubStyles), 'the personal hub must not restore a retired page background');
assert(!/body:has\(\.me-hub\)\s+\.app-bg[^}]*display\s*:\s*none/s.test(meHubStyles), 'the personal hub must not hide the shared wallpaper layer');
assert(!/body:has\(\.vibe-home\)\s+\.topnav\s*\{/s.test(homePageStyles), 'the homepage must not replace the shared glass navigation with an old theme surface');


if (process.exitCode) process.exit(process.exitCode);
console.log('Visual contracts passed: white default canvas, preserved user wallpaper, and accessible homepage states.');
