import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

// 网易云跨设备同步（音乐站）。
// 同源代理 /api/qz-sync/netease/* 转发到电台 Worker（radio.qianzhi.pw/api/dl/netease/*）；
// 鉴权、AES-GCM 加解密与 netease_account_links 表都在电台 Worker 那边，音乐站不存任何密钥。
// 必须在 apply-qianzhi-account.mjs 与 apply-music-login-tour.mjs 之后跑：
// HelpPage 的锚点来自前者（QianzhiAccountRow），App.tsx 的锚点来自后者（MusicLoginTour）。
// 只改构建期工作树，不提交进 Folia 子模块、不改 pin。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../folia");
const files = [
  ["src/services/qianzhiNeteaseSync.ts", "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"],
  ["src/components/modal/settings/pages/QianzhiNeteaseSyncRow.tsx", "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"],
  ["src/components/qianzhi/NeteaseSyncBootstrap.tsx", "H4sIAAAAAAAAA4VUXU8bRxR9319x8xLbElqrr3GdKkXlqYra8FhV1Wg9hhXrHbozDqWRpbWryIbYwYiSxGgpcgQRIm74aBJs1pT/Eu/M7j75L1TrXRxDFjpvcz/OuXPn3KsWFonB4BFGCpuCJ1Ck+Lt8HisMSpA3SAESRuBKZCQ1jHwCc5j9qCL993l1FlOqEn0cKstpWU5TbDxWFUzTv4ZRDxSFFPVJCAkAYB7Rh+QRpowYeEZDc1OX1sj2gDFcWGQ4FzoKyFiI98xhNrusK9NEp1hnoc3AKPc9UZD2EDOMKJ4mZEHFl74RSuSZMUhhVmV4Srr9FVF4wJTISFI6Dbx5yFf3veoBX90X5dd8tzHs15xuQ3RPxM6GY9vO+abTtby9i2F/ZWBWghyxssH7pr/zj9Nrum9b4uXHYX+Lv6mIvyxhddy3LX564rbsgVkWVkdYZ+Kk7bZs93xdvNpwztYHZtnpPeMrDbfS8y6qvFkXf+8Fxu6fQeTI+Mm0HPupd9Hia0feu3/5bjXtmyavngmrE94/mdvDfn30hKNjf7vl268c+3nI771/w9dOw+c4XVN02mNyt2Xz881hvy5qTb66w5vPee1UvDjy2x/87dcDs8J3j733e6L2QlgHrr3O322Jlx8d23R6Nf+Pc6fb4OWtS+JR5V677lfrjt3ga4di5Rlf3XcrvZB7YFaE1fHbH/jagXe4GZYy7Nf98gV/2vCrDb7b8A5PxXEl6KxCdMpg4ou+JYRRZqDFe6G05ZlpyEIyBdn7kfzGQk9OWoOjYQYK0hWsaTgHWcgjjeLM2B1yGUUdsoDosq5AMnUPfjBIQaX468dEzd2/ihccZixfswRHzUMyRvDJVAoMzIqGnolNuSr4ZAruZLOQ+Cpxe9b1efs/lvgRui0r7AyNlkIW0BJS2ZfrIpmKJ7wTZX4jI0XBlP7CyALWb6aL2whx2NGHYVrU2Liq+CVwY2mf9XD3bgQlRxC5FCypeo4syRpREFOJLhtYI+iLWkqgIKbMx+ggnYZwDMMJClbCDfMxHo6ryONb6TNloMRAppNlhK2E64ofdWlC8cwoTgg+wixNwU8/R1gRjl7UtIxUykgS/m202XM4j4Iux01iRvoPYVqV/2wGAAA="],
  ["test/unit/qianzhiNeteaseSync/syncClient.test.ts", "H4sIAAAAAAAAA42S0W7bMAxF3/MVfLMNxMkHBBvgulpqzJOx2CmwJ0GRGZeoLbmSnK0r+u+Dm6bJBqy1QL2Rh5cXl7reWA9PUKNTlnY4B/zVo/JzIA/PsLemg+BAHp0PVjM6tXeyLx+1YtYa+9a2WCyP5axaOrQHUuiWDyT17zvi6FE6HKeC1Wx22hcGHD2TDsE9agX4Auxk35NugjmEEXz6DE8zAADyYdDJ3oGVNZmLfgfejBK0R12DMjW6f0bHd7wrvFQeBmVWMZEX64yLDfu+zTbsOoiihTdXGAaOPMataUjHFh8GslgH0ep9IGcVS0omSlaWWcFFxm+TPLuEonNkdEz6IFuaACwqkWf8K7sWvBB5kSb5CX6G6qO5sTZ+FNxgHZOerDVJ02LLK5HeJHx9aYBUygzax+pO6mbC8eUPnopRcFrwL9l6+5ebozZl9J6aYYqR482irIoNE1ue3CZZnlzl7IwbtDxIauWuxRPrOVrN3pKyl23rYCfV/Us6JLVYw95YGPS9Nj/1a3SmBuW8+Ij62IviG6tuMr4WLC/Z/8ZHyeP/AzobIvKIAwAA"],
];

async function writeExact(relativePath, value) {
  const target = path.join(root, relativePath);
  const content = gunzipSync(Buffer.from(value, "base64")).toString("utf8");
  await fs.mkdir(path.dirname(target), { recursive: true });
  let current = null;
  try { current = await fs.readFile(target, "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (current === content) return;
  if (current !== null) throw new Error("Refusing to overwrite different overlay file: " + relativePath);
  await fs.writeFile(target, content, "utf8");
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error("Could not safely locate exactly one " + label + " anchor.");
  }
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

for (const [relativePath, value] of files) await writeExact(relativePath, value);

// ---- 音乐站 Worker 入口：同源同步代理路由（沿用 netease-workers overlay 的锚点）----
const workerEntryPath = path.join(root, "worker/index.ts");
let workerEntry = await fs.readFile(workerEntryPath, "utf8");
if (!workerEntry.includes("/api/qz-sync/")) {
  const importAnchor = 'import { QQ_API_PREFIX, type QqServerlessEnv, handleQq } from "./qq.ts";';
  workerEntry = replaceOnce(workerEntry, importAnchor,
    importAnchor + "\n" + 'import { handleNeteaseSync } from "../../worker/netease-sync-proxy.mjs";',
    "Folia Worker QQ import");
  const routeAnchor = '    if (url.pathname === "/api/generate-theme") {';
  const routeBlock = `    // 网易云跨设备同步：同源代理到电台 Worker，失败降级成 502 而不是把整站带下去。
    if (url.pathname === "/api/qz-sync/netease" || url.pathname.startsWith("/api/qz-sync/netease/")) {
      try {
        return await handleNeteaseSync(request);
      } catch (error) {
        console.error("[worker] NetEase sync proxy failed:", error);
        return new Response(
          JSON.stringify({ code: 502, msg: "NetEase sync proxy failed" }),
          { status: 502, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
        );
      }
    }

`;
  workerEntry = replaceOnce(workerEntry, routeAnchor, routeBlock + routeAnchor, "Folia Worker generate-theme route");
  await fs.writeFile(workerEntryPath, workerEntry, "utf8");
}

// ---- 设置 → 帮助 → 关于：同步行挂在“本站账号”行下面 ----
const helpPath = path.join(root, "src/components/modal/settings/pages/HelpPage.tsx");
let help = await fs.readFile(helpPath, "utf8");
if (!help.includes("<QianzhiNeteaseSyncRow />")) {
  const importAnchor = "import QianzhiAccountRow from './QianzhiAccountRow';";
  help = replaceOnce(help, importAnchor,
    importAnchor + "\n" + "import QianzhiNeteaseSyncRow from './QianzhiNeteaseSyncRow';",
    "HelpPage QianzhiAccountRow import (run apply-qianzhi-account.mjs first)");
  help = replaceOnce(help, "<QianzhiAccountRow />",
    "<QianzhiAccountRow />\n                <QianzhiNeteaseSyncRow />",
    "HelpPage QianzhiAccountRow mount");
  await fs.writeFile(helpPath, help, "utf8");
}

// ---- App 启动：挂载静默恢复件（沿用登录巡览的挂载方式）----
const appPath = path.join(root, "src/App.tsx");
let app = await fs.readFile(appPath, "utf8");
if (!app.includes("<NeteaseSyncBootstrap />")) {
  const importAnchor = "import MusicLoginTour from './components/qianzhi/MusicLoginTour';";
  app = replaceOnce(app, importAnchor,
    importAnchor + "\n" + "import NeteaseSyncBootstrap from './components/qianzhi/NeteaseSyncBootstrap';",
    "App MusicLoginTour import (run apply-music-login-tour.mjs first)");
  app = replaceOnce(app, "<MusicLoginTour />",
    "<MusicLoginTour />\n            <NeteaseSyncBootstrap />",
    "App MusicLoginTour mount");
  await fs.writeFile(appPath, app, "utf8");
}

// ---- Folia 原生退出网易云时：记下“不要自动恢复”，否则下次打开又被启动恢复登回去 ----
// 只打 logout()（用户主动退出才走这里）；登录过期走 signInRanOut，不动它。
const providerPath = path.join(root, "src/services/onlineMusic/netease/neteaseProvider.ts");
let provider = await fs.readFile(providerPath, "utf8");
if (!provider.includes("qz_netease_no_restore_v1")) {
  provider = replaceOnce(provider,
    "            await Promise.all([dropNeteaseSignIn(), told]);",
    "            await Promise.all([dropNeteaseSignIn(), told]);\n            // 退出是用户明确不要在这台设备上保持登录：记下来，启动恢复不再悄悄登回去。\n            try { localStorage.setItem('qz_netease_no_restore_v1', '1'); } catch { /* ignore */ }",
    "NeteaseProvider logout");
  await fs.writeFile(providerPath, provider, "utf8");
}

console.log("Applied NetEase cross-device sync (music site).");
