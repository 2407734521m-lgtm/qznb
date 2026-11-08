import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = (path, value) => writeFile(path, value, 'utf8');

const replaceOnce = (source, from, to, label) => {
  if (source.includes(to)) return source;
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error('Expected one ' + label + ' anchor; found ' + count + '.');
  }
  return source.replace(from, to);
};

const indexPath = resolve(root, 'index.html');
let html = await read(indexPath);
const htmlReplacements = [
  ['<meta name="description" content="一个动态歌词播放器，支持 AI 主题生成" />', '<meta name="description" content="Qianzhi Music：一个动态歌词播放器，支持 AI 主题生成" />'],
  ['<meta name="apple-mobile-web-app-title" content="Folia" />', '<meta name="apple-mobile-web-app-title" content="qianzhi" />'],
  ['<title>Folia</title>', '<title>qianzhi</title>'],
  ['aria-label="Loading Folia"', 'aria-label="Loading qianzhi"'],
  ['<div class="app-splash-title" aria-label="Folia"><span>F</span><span>o</span><span>l</span><span>i</span><span>a</span></div>', '<div class="app-splash-title" aria-label="qianzhi"><span>q</span><span>i</span><span>a</span><span>n</span><span>z</span><span>h</span><span>i</span></div>'],
  ['// Folia 五个字母不断跳到不同字形', '// qianzhi 品牌字母不断跳到不同字形'],
];
for (const [from, to] of htmlReplacements) {
  html = replaceOnce(html, from, to, 'index.html branding');
}
await write(indexPath, html);

const iconPath = resolve(root, 'public/icon.svg');
const qianzhiIcon = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="qianzhi-gradient" x1="48" y1="32" x2="464" y2="480" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#477F8B"/>
      <stop offset="1" stop-color="#9EA8E9"/>
    </linearGradient>
    <filter id="qianzhi-shadow" x="8%" y="7%" width="84%" height="88%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="9"/>
      <feOffset dx="3" dy="7" result="offset"/>
      <feComponentTransfer><feFuncA type="linear" slope=".24"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="132" fill="url(#qianzhi-gradient)"/>
  <g filter="url(#qianzhi-shadow)">
    <circle cx="238" cy="232" r="116" stroke="#fff" stroke-width="34"/>
    <path d="M319 313L394 388" stroke="#fff" stroke-width="38" stroke-linecap="round"/>
    <g stroke="#fff" stroke-width="19" stroke-linecap="round">
      <path d="M190 253V211"/>
      <path d="M230 274V190"/>
      <path d="M270 253V211"/>
    </g>
  </g>
</svg>`;
let icon = await read(iconPath);
if (!icon.includes('id="qianzhi-gradient"')) {
  if (!icon.includes('<!-- Stylized F Logo -->')) {
    throw new Error('The pinned upstream app icon changed; refusing to replace an unknown icon.');
  }
  await write(iconPath, qianzhiIcon);
}

const vitePath = resolve(root, 'vite.config.ts');
let vite = await read(vitePath);
vite = replaceOnce(vite, "name: 'Folia Music',", "name: 'Qianzhi Music',", 'PWA manifest name');
vite = replaceOnce(vite, "short_name: 'Folia',", "short_name: 'Qianzhi',", 'PWA manifest short name');
await write(vitePath, vite);

const localeText = {
  'zh-CN': 'Qianzhi Music 是基于 Folia 开源项目适配并托管的网页版本。Folia 为上游项目；本版本保留上游版权、GNU AGPL-3.0 授权及其非商业使用声明。',
  en: 'Qianzhi Music is a hosted web adaptation based on the open-source Folia project. Folia remains the upstream project; its copyright notices, GNU AGPL-3.0 license, and non-commercial use statement are retained.',
  in: 'Qianzhi Music adalah versi web yang diadaptasi dan dihosting berdasarkan proyek sumber terbuka Folia. Folia tetap menjadi proyek upstream; pemberitahuan hak cipta, lisensi GNU AGPL-3.0, dan pernyataan penggunaan nonkomersialnya tetap dipertahankan.',
  vi: 'Qianzhi Music là phiên bản web được điều chỉnh và lưu trữ dựa trên dự án mã nguồn mở Folia. Folia vẫn là dự án upstream; thông báo bản quyền, giấy phép GNU AGPL-3.0 và tuyên bố sử dụng phi thương mại của dự án được giữ nguyên.',
};
const promptReplacements = {
  'zh-CN': [
    ['我正在使用 GitHub 上的 folia-major 音乐播放器', '我正在使用 Qianzhi Music（基于 Folia 开源项目构建的托管网页版本）'],
    ['Folia 使用指南', 'Folia 上游使用指南'],
    ['Folia 源码仓库', 'Folia 上游源码仓库'],
  ],
  en: [
    ['I am using the folia-major music player on GitHub', 'I am using Qianzhi Music, a hosted web adaptation based on the open-source Folia project'],
    ['Folia Guide', 'Folia upstream guide'],
    ['Folia repository', 'Folia upstream repository'],
  ],
  in: [
    ['Saya menggunakan pemutar musik folia-major di GitHub', 'Saya menggunakan Qianzhi Music, versi web yang dihosting berdasarkan proyek sumber terbuka Folia'],
    ['Panduan Folia', 'Panduan upstream Folia'],
    ['Repositori Folia', 'Repositori upstream Folia'],
  ],
  vi: [
    ['Tôi đang dùng trình phát nhạc folia-major trên GitHub', 'Tôi đang dùng Qianzhi Music, phiên bản web được lưu trữ dựa trên dự án mã nguồn mở Folia'],
    ['Hướng dẫn Folia', 'Hướng dẫn upstream Folia'],
    ['Kho mã nguồn Folia', 'Kho mã nguồn upstream Folia'],
  ],
};
const localeFiles = ['zh-CN', 'en', 'in', 'vi'];
for (const localeName of localeFiles) {
  const localePath = resolve(root, 'src/i18n/locales/' + localeName + '.ts');
  let locale = await read(localePath);
  const protectedKeys = /^\s*"(?:formatFia|formatFiaDesc|formatLrcDesc|importFormats|qrReportWebDeployment|qrReportUnofficialBuild|unofficialBuildNotice|selfHostedBuildNotice|prompt)"\s*:/;
  const protectedText = /\.fia|folia-major|FOLIA_FFMPEG_PATH|icu-folia/i;
  locale = locale.split('\n').map(line => {
    if (!/\b(?:Folia|FOLIA)\b/.test(line) || protectedKeys.test(line) || protectedText.test(line)) return line;
    return line.replace(/\bFolia\b/g, 'Qianzhi').replace(/\bFOLIA\b/g, 'Qianzhi');
  }).join('\n');

  const promptKey = locale.split('\n').find(line => /^\s*"prompt"\s*:/.test(line));
  if (promptKey) {
    for (const [from, to] of promptReplacements[localeName]) {
      if (promptKey.includes(to)) continue;
      if (!promptKey.includes(from)) {
        throw new Error('Could not find the expected ' + localeName + ' support-prompt wording: ' + from);
      }
      locale = locale.replace(promptKey, promptKey.replace(from, to));
    }
  }

  if (!locale.includes('"qianzhiAttribution":')) {
    const helpStart = locale.indexOf('  "help": {');
    const helpEnd = locale.indexOf('\n  },', helpStart);
    if (helpStart < 0 || helpEnd < 0) throw new Error('Could not locate the help translations in ' + localeName + '.');
    const helpBlock = locale.slice(helpStart, helpEnd);
    const versionLine = helpBlock.split('\n').find(line => /^\s*"version"\s*:/.test(line));
    if (!versionLine) throw new Error('Could not locate the help version label in ' + localeName + '.');
    const indent = versionLine.match(/^\s*/)[0];
    const insertion = versionLine.replace(/,\s*$/, '') + ',\n' + indent + '"qianzhiAttribution": "' + localeText[localeName] + '"';
    locale = locale.replace(versionLine, insertion);
  }
  await write(localePath, locale);
}

const helpPath = resolve(root, 'src/components/modal/settings/pages/HelpPage.tsx');
let help = await read(helpPath);
const sourceNotice = "                <Row sub notice={t('help.qianzhiAttribution')} />";
if (!help.includes(sourceNotice)) {
  const anchor = '                <ChinaDrivesRow sub quiet />';
  help = replaceOnce(help, anchor, anchor + '\n' + sourceNotice, 'Qianzhi/Folia source attribution row');
  await write(helpPath, help);
}

const collectionLocalePath = resolve(root, 'src/i18n/locales/zh-CN.ts');
let collectionLocale = await read(collectionLocalePath);
const collectionBranded = '"latticeOpenCollection": "qianzhi",';
const collectionOriginal = '"latticeOpenCollection": "打开",';
if (collectionLocale.includes(collectionBranded)) {
  collectionLocale = replaceOnce(collectionLocale, collectionBranded, collectionOriginal, 'collection action label restoration');
  await write(collectionLocalePath, collectionLocale);
}

console.log('Applied complete Qianzhi user-facing branding. Folia upstream identifiers, attribution, license and non-commercial statement remain intact.');
