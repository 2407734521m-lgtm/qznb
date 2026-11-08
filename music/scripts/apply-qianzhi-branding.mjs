import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('music/folia');
const indexPath = resolve(root, 'index.html');
const localePath = resolve(root, 'src/i18n/locales/zh-CN.ts');

const replacements = [
  ['<meta name="apple-mobile-web-app-title" content="Folia" />', '<meta name="apple-mobile-web-app-title" content="qianzhi" />'],
  ['<title>Folia</title>', '<title>qianzhi</title>'],
  ['aria-label="Loading Folia"', 'aria-label="Loading qianzhi"'],
  ['<div class="app-splash-title" aria-label="Folia"><span>F</span><span>o</span><span>l</span><span>i</span><span>a</span></div>', '<div class="app-splash-title" aria-label="qianzhi"><span>q</span><span>i</span><span>a</span><span>n</span><span>z</span><span>h</span><span>i</span></div>'],
  ['// Folia 五个字母不断跳到不同字形', '// qianzhi 品牌字母不断跳到不同字形'],
];

let html = await readFile(indexPath, 'utf8');
for (const [from, to] of replacements) {
  if (html.includes(to)) continue;
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected one occurrence in index.html: ${from}; found ${count}`);
  html = html.replace(from, to);
}
await writeFile(indexPath, html, 'utf8');

let locale = await readFile(localePath, 'utf8');
const branded = '"latticeOpenCollection": "qianzhi",';
const original = '"latticeOpenCollection": "打开",';
if (locale.includes(branded)) {
  locale = locale.replace(branded, original);
  await writeFile(localePath, locale, 'utf8');
}
console.log('Applied qianzhi web branding and restored the collection action label.');
