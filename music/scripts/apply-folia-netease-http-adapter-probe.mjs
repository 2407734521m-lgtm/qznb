import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve("music/folia/worker/index.ts");
const source = await readFile(target, "utf8");

const importAnchor = 'import { QQ_API_PREFIX, type QqServerlessEnv, handleQq } from "./qq.ts";';
const probeImport = 'import { handleNeteaseHttpAdapterProbe } from "../../worker/netease-http-adapter-probe.mjs";';
const routeAnchor = '    if (url.pathname === "/api/generate-theme") {';
const routeBlock = `    if (
      url.pathname === "/api/netease-adapter-probe" ||
      url.pathname.startsWith("/api/netease-adapter-probe/")
    ) {
      try {
        return await handleNeteaseHttpAdapterProbe(request);
      } catch (error) {
        console.error("[worker] NetEase HTTP adapter probe failed:", error);
        return new Response(
          JSON.stringify({ ok: false, error: "Node HTTP adapter probe failed" }),
          { status: 502, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
        );
      }
    }

`;

if (!source.includes(importAnchor)) {
  throw new Error("Folia Worker import anchor not found; refusing to patch an unknown upstream layout.");
}
if (!source.includes(routeAnchor)) {
  throw new Error("Folia Worker route anchor not found; refusing to patch an unknown upstream layout.");
}

let next = source;
if (!next.includes(probeImport)) {
  next = next.replace(importAnchor, importAnchor + String.fromCharCode(10) + probeImport);
}
if (!next.includes("/api/netease-adapter-probe")) {
  next = next.replace(routeAnchor, routeBlock + routeAnchor);
}

if (next === source) {
  console.log("NetEase HTTP adapter probe is already applied.");
} else {
  await writeFile(target, next, "utf8");
  console.log("Applied isolated NetEase HTTP adapter probe to Folia Worker.");
}
