import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const musicDir = path.resolve(scriptDir, '..');
const foliaDir = path.join(musicDir, 'folia');

async function writeCopiedSource(sourcePath, targetPath) {
  const source = await fs.readFile(sourcePath, 'utf8');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  let current = null;
  try { current = await fs.readFile(targetPath, 'utf8'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (current === source) return;
  if (current !== null) {
    throw new Error('Refusing to overwrite different Qianzhi embed bridge source: ' + targetPath);
  }
  await fs.writeFile(targetPath, source, 'utf8');
}

function replaceOnce(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('Qianzhi embed overlay expected one unambiguous ' + label + ' anchor.');
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const bridgeSource = path.join(musicDir, 'overlays/QianzhiEmbedBridge.tsx');
const bridgeTarget = path.join(foliaDir, 'src/components/qianzhi/QianzhiEmbedBridge.tsx');
await writeCopiedSource(bridgeSource, bridgeTarget);

const overlaysPath = path.join(foliaDir, 'src/components/app/overlays/AppOverlays.tsx');
let overlays = await fs.readFile(overlaysPath, 'utf8');
const importAnchor = "import HifiSignalPathPanel from '../../hifi/HifiSignalPathPanel';";
const importLine = "import QianzhiEmbedBridge from '../../qianzhi/QianzhiEmbedBridge';";
if (!overlays.includes(importLine)) {
  overlays = replaceOnce(overlays, importAnchor, importAnchor + '\n' + importLine, 'AppOverlays bridge import');
}
const renderAnchor = '        <>\n            {searchOverlay && <SearchWorkspace {...searchOverlay} />}';
const renderReplacement = '        <>\n            <QianzhiEmbedBridge model={model} />\n            {searchOverlay && <SearchWorkspace {...searchOverlay} />';
overlays = replaceOnce(overlays, renderAnchor, renderReplacement, 'AppOverlays bridge mount');
await fs.writeFile(overlaysPath, overlays, 'utf8');

const workerPath = path.join(foliaDir, 'worker/index.ts');
let worker = await fs.readFile(workerPath, 'utf8');
const workerAnchor = '    return env.ASSETS.fetch(request);';
const workerReplacement = [
  '    const response = await env.ASSETS.fetch(request);',
  "    const contentType = response.headers.get('content-type') || '';",
  "    if (!contentType.toLowerCase().includes('text/html')) {",
  '      return response;',
  '    }',
  '',
  '    // Only the Qianzhi main-site origins may embed this music app. Keep every other',
  '    // upstream CSP directive intact and remove the conflicting legacy X-Frame-Options.',
  '    const headers = new Headers(response.headers);',
  "    const directives = (headers.get('Content-Security-Policy') || '')",
  "      .split(';')",
  '      .map((directive) => directive.trim())',
  '      .filter(Boolean)',
  '      .filter((directive) => !/^frame-ancestors\\\\b/i.test(directive));',
  '    directives.push("frame-ancestors \'self\' https://qianzhi.pw https://www.qianzhi.pw");',
  "    headers.set('Content-Security-Policy', directives.join('; '));",
  "    headers.delete('X-Frame-Options');",
  '',
  '    return new Response(response.body, {',
  '      status: response.status,',
  '      statusText: response.statusText,',
  '      headers,',
  '    });',
].join('\n');
worker = replaceOnce(worker, workerAnchor, workerReplacement, 'Worker static asset response');
await fs.writeFile(workerPath, worker, 'utf8');

console.log('Applied the Qianzhi main-site music iframe bridge and restricted embed policy.');
