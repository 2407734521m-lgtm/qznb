import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const packageRoot = resolve("music/folia/node_modules/@neteasecloudmusicapienhanced/api");
const requestPath = resolve(packageRoot, "util/request.js");
const cryptoPath = resolve(packageRoot, "util/crypto.js");
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

let cryptoSource = await read(cryptoPath);
const xeapiStart = cryptoSource.indexOf("const xeapiEncryptS =");
const xeapiEnd = cryptoSource.indexOf("\n\nconst buildXeapiPlaintext", xeapiStart);
if (xeapiStart < 0 || xeapiEnd < 0) throw new Error("Folia XEAPI X25519 helper anchor changed");
const workersXeapiEncryptS = "const xeapiEncryptS = async (dynamicKey, publicKeyState, os) => {\n  const subtle = globalThis.crypto && globalThis.crypto.subtle\n  if (!subtle) throw new Error('Web Crypto subtle API is unavailable')\n\n  const peerRaw = Buffer.from(publicKeyState.publicKey, 'base64')\n  const ephemeralPair = await subtle.generateKey(\n    { name: 'X25519' },\n    true,\n    ['deriveBits'],\n  )\n  const ephemeralRaw = Buffer.from(await subtle.exportKey('raw', ephemeralPair.publicKey))\n  const peerKey = await subtle.importKey(\n    'raw',\n    peerRaw,\n    { name: 'X25519' },\n    false,\n    [],\n  )\n  const sharedSecret = Buffer.from(\n    await subtle.deriveBits(\n      { name: 'X25519', public: peerKey },\n      ephemeralPair.privateKey,\n      256,\n    ),\n  )\n  const aesKey = deriveX25519AesKey(sharedSecret, ephemeralRaw)\n  const iv = crypto.randomBytes(12)\n  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, iv)\n  const plaintext = Buffer.from(\n    dynamicKey.toString('base64') + '|' + os + '|' + (publicKeyState.sk || ''),\n  )\n  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])\n  return Buffer.concat([ephemeralRaw, iv, encrypted, cipher.getAuthTag()])\n}";
cryptoSource = cryptoSource.slice(0, xeapiStart) + workersXeapiEncryptS + cryptoSource.slice(xeapiEnd);
const syncXeapiDeclaration = "const xeapi = (uri, data, options = {}) => {";
if (!cryptoSource.includes(syncXeapiDeclaration)) throw new Error("Folia XEAPI declaration anchor changed");
cryptoSource = cryptoSource.replace(syncXeapiDeclaration, "const xeapi = async (uri, data, options = {}) => {");
const syncXeapiS = "  const s = xeapiEncryptS(dynamicKey, publicKeyState, options.os || 'android')";
if (!cryptoSource.includes(syncXeapiS)) throw new Error("Folia XEAPI S-field anchor changed");
cryptoSource = cryptoSource.replace(syncXeapiS, "  const s = await xeapiEncryptS(dynamicKey, publicKeyState, options.os || 'android')");
await write(cryptoPath, cryptoSource);

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

const deviceIdImportAnchor = `  generateRandomChineseIP,
} = require('./index')`;
if (!requestSource.includes(deviceIdImportAnchor)) throw new Error("NetEase device ID helper import anchor changed");
requestSource = requestSource.replace(
  deviceIdImportAnchor,
  `  generateRandomChineseIP,
  generateDeviceId,
} = require('./index')`,
);

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
const newState = `// Workers edition: keep XEAPI state in the current isolate, never in temporary files.
const anonymous_token = ''
let xeapi_public_key = null
let xeapiPublicKeyPromise = null
const { getXeapiPublicKey } = require('./xeapiKey')
const loadXeapiPublicKey = () => xeapi_public_key
const ensureXeapiPublicKey = async () => {
  if (xeapi_public_key) return xeapi_public_key
  if (!xeapiPublicKeyPromise) {
    xeapiPublicKeyPromise = (async () => {
      const deviceId = global.deviceId || generateDeviceId()
      global.deviceId = deviceId
      xeapi_public_key = await getXeapiPublicKey({}, deviceId)
      return xeapi_public_key
    })().finally(() => {
      xeapiPublicKeyPromise = null
    })
  }
  return xeapiPublicKeyPromise
}`;
if (!requestSource.includes(oldState)) throw new Error("NetEase temp-file state block changed");
requestSource = requestSource.replace(oldState, newState);

const encryptDataDeclaration = "    let encryptData = ''";
if (!requestSource.includes(encryptDataDeclaration)) throw new Error("NetEase encryptData declaration anchor changed");
requestSource = requestSource.replace(encryptDataDeclaration, encryptDataDeclaration + "\n    let pendingEncryptData = null");

const xeapiEncryptAssignment = "        encryptData = encrypt.xeapi(uri, data, {";
if (!requestSource.includes(xeapiEncryptAssignment)) throw new Error("NetEase XEAPI assignment anchor changed");
requestSource = requestSource.replace(xeapiEncryptAssignment, "        pendingEncryptData = encrypt.xeapi(uri, data, {");

const dispatchAnchor = "    const use_e_r = (crypto === 'eapi' || crypto === 'weapi') && data.e_r";
if (!requestSource.includes(dispatchAnchor)) throw new Error("NetEase request dispatch anchor changed");
requestSource = requestSource.replace(dispatchAnchor, "    const dispatch = () => {\n" + dispatchAnchor);

const requestTailAnchor = "\n  })\n}\n\nmodule.exports = createRequest";
const requestTailReplacement = "\n    }\n    if (pendingEncryptData) {\n      pendingEncryptData\n        .then(payload => {\n          encryptData = payload\n          dispatch()\n        })\n        .catch(reject)\n    } else {\n      dispatch()\n    }\n  })\n}\n\nmodule.exports = createRequest";
if (!requestSource.includes(requestTailAnchor)) throw new Error("NetEase request executor tail anchor changed");
requestSource = requestSource.replace(requestTailAnchor, requestTailReplacement);

const createRequestAnchor = `const createRequest = async (uri, data, options) => {
  let token = ''`;
if (!requestSource.includes(createRequestAnchor)) throw new Error("NetEase createRequest anchor changed");
requestSource = requestSource.replace(
  createRequestAnchor,
  `const createRequest = async (uri, data, options) => {
  const requestedCrypto = options.crypto === '' ? (APP_CONF.encrypt ? 'eapi' : 'api') : options.crypto
  if (requestedCrypto === 'xeapi') await ensureXeapiPublicKey()
  let token = ''`,
);

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
// NetEase's anonymous bootstrap endpoint returns business code 400 with XEAPI in the Worker runtime;
 // keep that one registration endpoint on its accepted EAPI mode. Song URL requests remain XEAPI.
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
  const options = createOption(query, 'xeapi')
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
  // Preserve NetEase's real rejection body/status. Folia's native provider distinguishes
  // transient network failures from expired QR codes and account risk-control responses.
  // The Express adapter relays rejected { status, body, cookie } answers to the browser.
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

// Keep unknown API paths out of the SPA fallback. A typo or removed diagnostic endpoint
// should return a real JSON 404 instead of index.html with HTTP 200.
const apiFallbackAnchor = "    return env.ASSETS.fetch(request);";
const apiFallback = `    if (url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ code: 404, msg: "API route not found" }),
        { status: 404, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
      );
    }

`;
if (!workerEntry.includes(apiFallbackAnchor)) throw new Error("Folia Worker asset fallback anchor changed");
if (!workerEntry.includes("API route not found")) {
  workerEntry = workerEntry.replace(apiFallbackAnchor, apiFallback + apiFallbackAnchor);
}
await write(workerEntryPath, workerEntry);

console.log(`Prepared ${routeNames.length} allowlisted NetEase API routes for Cloudflare Workers.`);
