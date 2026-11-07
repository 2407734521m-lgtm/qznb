import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const styles = read('../src/styles-ios26-liquid-glass.css');
const wallpaper = read('../src/lib/wallpaper.ts');
const app = read('../src/App.tsx');
const home = read('../src/pages/Home.tsx');
const homeCss = read('../src/pages/Home.vibe.css');

function assert(condition, message) {
  if (!condition) {
    console.error(`Style contract failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(/--visual-bg:\s*#ffffff/.test(styles), 'the site canvas default must stay white');
assert(/html, body, #root\s*\{[^}]*background:\s*#ffffff\s*!important/s.test(styles), 'the document canvas must stay white');
assert(/\.glow\s*\{[^}]*background:\s*transparent\s*!important/s.test(styles), 'the glow layer must not cover the wallpaper');
assert(!/\.app-bg(?:\.qz-ios26-backdrop)?\s*\{[^}]*background(?:-image)?\s*:[^;]*!important/s.test(styles), 'global CSS must not override the app wallpaper layer');
assert(wallpaper.includes("return { src: '#ffffff', kind: 'grad', blur: 0, dark: 0 };"), 'fresh installs must use a white default canvas');
assert(wallpaper.includes("return { src: 'default', kind: 'img', blur: 0, dark: 0 };"), 'an explicitly saved default wallpaper must be restored');
assert(app.includes('className="app-bg qz-ios26-backdrop"') && app.includes('filter: `blur(${wp.blur}px) brightness(${100 - wp.dark}%)`'), 'the app must retain dynamic wallpaper and filter bindings');
assert(home.includes('className="vh-load-state"') && home.includes('className="vh-load-error"'), 'the homepage must expose loading and error states');
assert(home.includes('setReloadKey(value => value + 1)'), 'the homepage error state must offer a retry action');
assert(home.includes('<Link') && homeCss.includes('.vh-hero:focus-visible') && homeCss.includes('.vh-feed-row:focus-visible'), 'homepage navigation links must have visible keyboard focus');
assert(/body:has\\(\\.vibe-home\\)\\s*\\{[^}]*background:\\s*#ffffff\\s*!important/s.test(homeCss), 'the homepage canvas must stay white');
assert(!/body:has\\(\\.vibe-home\\)\\s+\\.app-bg[^}]*display:\\s*none\\s*!important/s.test(homeCss), 'the homepage must not hide the user wallpaper layer');

if (process.exitCode) process.exit(process.exitCode);
console.log('Visual contracts passed: white default canvas, preserved user wallpaper, and accessible homepage states.');
