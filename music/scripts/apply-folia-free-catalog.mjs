import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const root = resolve('music/folia');
const read = path => readFile(path, 'utf8');
const write = async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
};
const replaceOnce = (source, needle, replacement, label) => {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error('Free catalog overlay could not find ' + label + ' anchor');
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error('Free catalog overlay found ambiguous ' + label + ' anchor');
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
};

const providerPath = resolve(root, 'src/services/onlineMusic/freeCatalog/freeCatalogProvider.ts');
const providerTemplatePath = resolve('music/worker/free-catalog-provider.template.ts');
await write(providerPath, await read(providerTemplatePath));

const registryPath = resolve(root, 'src/services/onlineMusic/providerRegistry.ts');
let registry = await read(registryPath);
const importAnchor = "import { fnmusicProvider } from './fnmusic/fnmusicProvider';";
const importLine = "import { freeCatalogProvider } from './freeCatalog/freeCatalogProvider';";
if (!registry.includes(importLine)) registry = replaceOnce(registry, importAnchor, importAnchor + '\n' + importLine, 'provider import');
const registerAnchor = 'registerOnlineMusicProvider(fnmusicProvider);';
if (!registry.includes('registerOnlineMusicProvider(freeCatalogProvider);')) {
    registry = replaceOnce(registry, registerAnchor, registerAnchor + '\nregisterOnlineMusicProvider(freeCatalogProvider);', 'provider registration');
}
await write(registryPath, registry);

const workerPath = resolve(root, 'worker/index.ts');
let workerEntry = await read(workerPath);
const qqImport = 'import { QQ_API_PREFIX, type QqServerlessEnv, handleQq } from "./qq.ts";';
const freeImport = 'import { handleFreeMusicApi } from "../../worker/free-music-api.mjs";';
if (!workerEntry.includes(freeImport)) workerEntry = replaceOnce(workerEntry, qqImport, qqImport + '\n' + freeImport, 'Worker import');
const routeAnchor = '    if (url.pathname === "/api/generate-theme") {';
const route = [
'    if (url.pathname === "/api/free-music/search" || url.pathname === "/api/free-music/track") {',
'      try { return await handleFreeMusicApi(request, env); }',
'      catch (error) {',
'        console.error("[worker] free music catalog route failed:", error);',
'        return new Response(JSON.stringify({ code: 502, message: "Free music catalog request failed" }), {',
'          status: 502, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },',
'        });',
'      }',
'    }',
'',
'',
].join('\n');
if (!workerEntry.includes('url.pathname === "/api/free-music/search"')) workerEntry = replaceOnce(workerEntry, routeAnchor, route + routeAnchor, 'Worker route');
await write(workerPath, workerEntry);

const rowPath = resolve(root, 'src/components/app/search/SearchResultRow.tsx');
let row = await read(rowPath);
const metaAnchor = '    const metadata = getProviderSongMetadata(track);';
const licenseState = [
'    const freeCatalogData = track.sourceRef?.kind === "online" && track.sourceRef.providerId === "freecatalog" ? track.sourceRef.providerData : undefined;',
'    const freeCatalogLicenseLabel = typeof freeCatalogData?.licenseLabel === "string" ? freeCatalogData.licenseLabel : "";',
'    const freeCatalogLicenseUrl = typeof freeCatalogData?.licenseUrl === "string" && freeCatalogData.licenseUrl.startsWith("https://creativecommons.org/") ? freeCatalogData.licenseUrl : "";',
'    const freeCatalogSourceUrl = typeof freeCatalogData?.sourceUrl === "string" && freeCatalogData.sourceUrl.startsWith("https://") ? freeCatalogData.sourceUrl : "";',
'    const freeCatalogSourceLabel = typeof freeCatalogData?.sourceLabel === "string" ? freeCatalogData.sourceLabel : "曲库来源";',
].join('\n');
if (!row.includes('const freeCatalogLicenseLabel')) row = replaceOnce(row, metaAnchor, metaAnchor + '\n' + licenseState, 'license state');
const rowAnchor = '                    </div>\n                </div>\n\n                <span className="hidden shrink-0 font-mono text-xs opacity-40 sm:block">';
const attribution = [
'                    </div>',
'                    {freeCatalogLicenseUrl && (',
'                        <div className="mt-1 flex min-w-0 items-center gap-2 text-[10px]" style={{ color: "var(--text-secondary)" }}>',
'                            <a href={freeCatalogLicenseUrl} target="_blank" rel="noreferrer" className="truncate underline decoration-current/30 underline-offset-2">',
'                                许可：{freeCatalogLicenseLabel || "Creative Commons"}',
'                            </a>',
'                            {freeCatalogSourceUrl && (',
'                                <a href={freeCatalogSourceUrl} target="_blank" rel="noreferrer" className="shrink-0 opacity-70 hover:opacity-100">',
'                                    来源：{freeCatalogSourceLabel}',
'                                </a>',
'                            )}',
'                        </div>',
'                    )}',
'                </div>',
'',
'                <span className="hidden shrink-0 font-mono text-xs opacity-40 sm:block">',
].join('\n');
if (!row.includes('许可：{freeCatalogLicenseLabel')) row = replaceOnce(row, rowAnchor, attribution, 'license attribution');
await write(rowPath, row);

console.log('Applied accountless free music provider, Worker routes and license/source links to Folia.');

