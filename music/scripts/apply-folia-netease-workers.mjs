import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const packageRoot = resolve("music/folia/node_modules/@neteasecloudmusicapienhanced/api");
const requestPath = resolve(packageRoot, "util/request.js");
const anonymousPath = resolve(packageRoot, "module/register_anonimous.js");
const songUrlPath = resolve(packageRoot, "module/song_url_v1.js");
const qrCheckPath = resolve(packageRoot, "module/login_qr_check.js");
const qrCreatePath = resolve(packageRoot, "module/login_qr_create.js");
const generatedPath = resolve("music/folia/worker/netease-modules.generated.ts");
const workerEntryPath = resolve("music/folia/worker/index.ts");

const read = async path => readFile(path, "utf8");
const write = async (path, text) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
};

let requestSource = await read(requestPath);
const axiosImport = "const { default: axios } = require('axios')";
if (!requestSource.includes(axiosImport)) throw new Error("NetEase request axios import anchor changed");
requestSource = requestSource.replace(axiosImport, `const axiosModule = require('axios')
const axios = axiosModule.default || axiosModule
axios.defaults.adapter = 'fetch'`);

const nodeImports = [
  "const { PacProxyAgent } = require('pac-proxy-agent')",
  "const http = require('http')",
  "const https = require('https')",
  "const tunnel = require('tunnel')",
  "const fs = require('fs')",
  "const path = require('path')",
  "const tmpPath = require('os').tmpdir()",
];
for (const line of nodeImports) requestSource = requestSource.replace(line, "");

const oldState = `// 预先读取匿名token并缓存
const anonymous_token = fs.readFileSync(
  path.resolve(tmpPath, './anonymous_token'),
  'utf-8',
)
const xeapiPublicKeyPath = path.resolve(tmpPath, './xeapi_public_key')
let xeapi_public_key = null
const loadXeapiPublicKey = () => {
  if (!xeapi_public_key && fs.existsSync(xeapiPublicKeyPath)) {
    try {
      xeapi_public_key = JSON.parse(
        fs.readFileSync(xeapiPublicKeyPath, 'utf-8'),
      )
    } catch (error) {
      console.log('[ERR]', error)
    }
  }
  return xeapi_public_key
}`;
const newState = `// Workers edition: request-scoped filesystem writes are not used for provider state.
const anonymous_token = ''
const loadXeapiPublicKey = () => null`;
if (!requestSource.includes(oldState)) throw new Error("NetEase temp-file state block changed");
requestSource = requestSource.replace(oldState, newState);

const oldAgents = `// 预先创建HTTP/HTTPS agents并重用
const createHttpAgent = () => new http.Agent({ keepAlive: true })
const createHttpsAgent = () => new https.Agent({ keepAlive: true })
`;
if (!requestSource.includes(oldAgents)) throw new Error("NetEase HTTP agent block changed");
requestSource = requestSource.replace(oldAgents, "");

requestSource = requestSource.replace(
  "      httpAgent: createHttpAgent(),\n      httpsAgent: createHttpsAgent(),\n",
  ""
);
const proxyStart = requestSource.indexOf("    // 代理处理\n");
const proxyEnd = requestSource.indexOf("    // console.log(settings.headers);", proxyStart);
if (proxyStart < 0 || proxyEnd < 0) throw new Error("NetEase outbound proxy block changed");
requestSource = requestSource.slice(0, proxyStart) + requestSource.slice(proxyEnd);
await write(requestPath, requestSource);

let anonymousSource = await read(anonymousPath);
if (!anonymousSource.includes("createOption(query, 'xeapi')")) throw new Error("Anonymous registration crypto anchor changed");
anonymousSource = anonymousSource.replace("createOption(query, 'xeapi')", "createOption(query, 'eapi')");
await write(anonymousPath, anonymousSource);

const songUrlSource = `// Cloudflare Workers edition: keep the upstream song URL endpoint, without optional external unblocking.
const createOption = require('../util/option.js')
const { cookieToJson } = require('../util/index.js')

module.exports = async (query, request) => {
  const data = {
    ids: '[' + query.id + ']',
    level: query.level,
    encodeType: 'flac',
  }
  const options = createOption(query, 'eapi')
  if (data.level == 'sky') data.immerseType = query.immerseType || 'c51'
  if (data.level == 'vivid') {
    data.encodeType = 'mp3'
    const cookie = options.cookie
    options.cookie = {
      ...(typeof cookie === 'string' ? cookieToJson(cookie) : cookie),
      os: 'android',
      appver: '9.5.61',
    }
  }
  return request('/api/song/enhance/player/url/v1', data, options)
}
`;
await write(songUrlPath, songUrlSource);

const qrCheckSource = `const createOption = require('../util/option.js')
module.exports = async (query, request) => {
  try {
    const result = await request(
      '/api/login/qrcode/client/login',
      { key: query.key, type: 3 },
      createOption(query),
    )
    return {
      status: 200,
      body: { ...result.body, cookie: (result.cookie || []).join(';') },
      cookie: result.cookie || [],
    }
  } catch {
    // A pending QR scan is an ordinary polling state, not an HTTP 500.
    return { status: 200, body: {}, cookie: [] }
  }
}
`;
await write(qrCheckPath, qrCheckSource);

const qrCreateSource = `const QRCode = require('qrcode')
const { generateChainId } = require('../util/index.js')

module.exports = async query => {
  const platform = query.platform || 'pc'
  const cookie = query.cookie || ''
  let url = \`https://music.163.com/login?codekey=\${query.key}\`
  if (platform === 'web') {
    url += \`&chainId=\${generateChainId(cookie)}\`
  }
  // SVG rendering is pure JavaScript and avoids node-canvas/native bindings in Workers.
  const svg = query.qrimg ? await QRCode.toString(url, { type: 'svg', margin: 1 }) : ''
  return {
    status: 200,
    body: {
      code: 200,
      data: {
        qrurl: url,
        qrimg: svg ? \`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(svg)}\` : '',
      },
    },
    cookie: [],
  }
}
`;
await write(qrCreatePath, qrCreateSource);

const routeNames = ["register_anonimous","login_qr_key","login_qr_create","login_qr_check","login_status","logout","user_account","song_detail","song_copyright_rcmd","like","scrobble_v1","likelist","user_playlist","playlist_track_all","playlist_detail","playlist_tracks","album","album_sublist","artist_detail","artist_album","artist_top_song","artist_songs","song_url_v1","lyric_new","song_chorus","cloud_lyric_get","user_record","user_cloud","user_cloud_detail","cloudsearch","personal_fm","personal_fm_mode","recommend_songs","recommend_songs_dislike","history_recommend_songs","history_recommend_songs_detail","recommend_category_configs","recommend_category_songs","recommend_category_set","personalized","homepage_block_page","recommend_resource","toplist","top_song","album_new","top_playlist","simi_song","fm_trash","playlist_subscribe","album_sub","playlist_detail_dynamic","album_detail_dynamic"];
const imports = routeNames.map((name, index) =>
  `// @ts-ignore Upstream API module is CommonJS JavaScript without declaration files.\nimport module${index} from "../node_modules/@neteasecloudmusicapienhanced/api/module/${name}.js";`
).join("\n");
const definitions = routeNames.map((name, index) => {
  const route = name === "personal_fm" ? "/personal_fm" : name === "fm_trash" ? "/fm_trash" : "/" + name.replace(/_/g, "/");
  return `  { name: ${JSON.stringify(name)}, route: ${JSON.stringify(route)}, handler: (module${index} as any)?.default ?? (module${index} as any) },`;
}).join("\n");
const generated = `// Generated by music/scripts/apply-folia-netease-workers.mjs. Do not edit by hand.\n${imports}\n\nexport const NCM_MODULES = [\n${definitions}\n] as const;\n`;
await write(generatedPath, generated);

let workerEntry = await read(workerEntryPath);
const importAnchor = 'import { QQ_API_PREFIX, type QqServerlessEnv, handleQq } from "./qq.ts";';
const apiImport = 'import { handleNeteaseApi } from "../../worker/netease-api-adapter.mjs";';
const routeAnchor = '    if (url.pathname === "/api/generate-theme") {';
const routeBlock = `    if (url.pathname === "/api/netease" || url.pathname.startsWith("/api/netease/")) {
      try {
        return await handleNeteaseApi(request);
      } catch (error) {
        console.error("[worker] NetEase API adapter failed:", error);
        return new Response(
          JSON.stringify({ code: 502, msg: "NetEase API adapter failed" }),
          { status: 502, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
        );
      }
    }

`;
if (!workerEntry.includes(importAnchor)) throw new Error("Folia Worker QQ import anchor changed");
if (!workerEntry.includes(routeAnchor)) throw new Error("Folia Worker route anchor changed");
if (!workerEntry.includes(apiImport)) workerEntry = workerEntry.replace(importAnchor, importAnchor + "\n" + apiImport);
if (!workerEntry.includes("/api/netease/")) workerEntry = workerEntry.replace(routeAnchor, routeBlock + routeAnchor);
await write(workerEntryPath, workerEntry);

console.log(`Prepared ${routeNames.length} allowlisted NetEase API routes for Cloudflare Workers.`);
