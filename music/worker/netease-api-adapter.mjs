import { createServer } from "node:http";
import express from "../folia/node_modules/express/index.js";
// @ts-ignore Cloudflare runtime-only module, enabled by nodejs_compat.
import { handleAsNodeRequest } from "cloudflare:node";
import createNeteaseRequest from "../folia/node_modules/@neteasecloudmusicapienhanced/api/util/request.js";
import { NCM_MODULES } from "../folia/worker/netease-modules.generated.ts";

const PREFIX = "/api/netease";
const PORT = 3918;
const requestModule = (createNeteaseRequest && createNeteaseRequest.default) || createNeteaseRequest;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));
app.use(express.urlencoded({ extended: false, limit: "128kb" }));

const parseCookies = (value = "") => {
  const result = {};
  for (const item of value.split(";")) {
    const index = item.indexOf("=");
    if (index <= 0) continue;
    const key = item.slice(0, index).trim();
    const raw = item.slice(index + 1).trim();
    try {
      result[decodeURIComponent(key)] = decodeURIComponent(raw);
    } catch {
      result[key] = raw;
    }
  }
  return result;
};

const allowed = new Map(NCM_MODULES.map(item => [item.route, item]));
const sendCookies = (response, value) => {
  const cookies = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const safeCookies = cookies
    .filter(cookie => typeof cookie === "string" && cookie.length > 0)
    .map(cookie => /;\\s*SameSite=/i.test(cookie) ? cookie : `${cookie}; SameSite=None; Secure`);
  if (safeCookies.length) response.append("Set-Cookie", safeCookies);
};

app.get("/healthz", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    ok: true,
    provider: "netease",
    adapter: "express-node-http",
    routeCount: NCM_MODULES.length,
    upstream: "@neteasecloudmusicapienhanced/api@4.41.1",
  });
});

app.all("/{*splat}", async (request, response) => {
  const route = request.path;
  const definition = allowed.get(route);
  if (!definition) {
    response.status(404).json({ code: 404, msg: "NetEase API route is not enabled" });
    return;
  }

  const origin = request.get("origin");
  const requestOrigin = `${request.protocol}://${request.get("host")}`;
  if (origin && origin === requestOrigin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.status(204).end();
    return;
  }

  const query = {
    cookie: parseCookies(request.headers.cookie),
    ...(request.query || {}),
    ...(request.body && typeof request.body === "object" ? request.body : {}),
  };
  if (typeof query.cookie === "string") query.cookie = parseCookies(query.cookie);

  // Do not turn this endpoint into a proxy or let a caller spoof upstream client IPs.
  for (const key of ["proxy", "realIP", "ip", "headers", "domain", "ua", "timeout", "checkToken", "randomCNIP", "unblock", "source", "crypto"]) {
    delete query[key];
  }

  try {
    const result = await definition.handler(query, (...args) => requestModule(...args));
    if (!result || typeof result !== "object") {
      response.status(502).json({ code: 502, msg: "Invalid NetEase API response" });
      return;
    }
    sendCookies(response, result.cookie);
    response.status(Number(result.status) || 200).send(result.body ?? result);
  } catch (error) {
    const status = Number(error && error.status);
    const body = error && error.body;
    if (body && typeof body === "object") {
      sendCookies(response, error.cookie);
      response.status(status >= 400 && status < 600 ? status : 502).send(body);
      return;
    }
    const message = String((error && error.message) || error);
    console.error("[netease-worker] upstream request failed", {
      route,
      message: message.slice(0, 240),
    });

    // Safe, narrowly scoped diagnostics are available only on this public preview Worker.
    // Never return raw request config, cookies, headers, upstream bodies, or key material.
    const isPreviewDiagnostic =
      request.hostname === "qianzhi-music-preview.2407734521m.workers.dev" &&
      request.query && request.query.debug === "1";
    if (isPreviewDiagnostic) {
      const safeMessages = new Set([
        "xeapi public key request failed",
        "xeapi public key response signature mismatch",
        "xeapi public key response missing sk",
        "xeapi public key is missing",
      ]);
      const errorCode = error && typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
        ? error.code
        : undefined;
      const upstreamStatus = Number(error && (error.status || (error.response && error.response.status))) || undefined;
      const safeMessage = safeMessages.has(message) || /^Request failed with status code \d{3}$/.test(message)
        ? message
        : undefined;
      response.status(502).json({
        code: 502,
        msg: "NetEase upstream request failed",
        diagnostic: {
          errorName: String((error && error.name) || "Error"),
          ...(errorCode ? { errorCode } : {}),
          ...(upstreamStatus ? { upstreamStatus } : {}),
          ...(safeMessage ? { safeMessage } : {}),
          stage: message.toLowerCase().includes("xeapi public key")
            ? "xeapi-key-initialization"
            : message.toLowerCase().includes("fetch")
              ? "outbound-fetch"
              : "upstream-request",
        },
      });
      return;
    }
    response.status(502).json({ code: 502, msg: "NetEase upstream request failed" });
  }
});

const server = createServer(app);
server.listen(PORT);

export async function handleNeteaseApi(request) {
  const url = new URL(request.url);
  if (url.pathname === PREFIX || url.pathname === `${PREFIX}/`) url.pathname = `${PREFIX}/healthz`;
  url.pathname = url.pathname === `${PREFIX}/healthz`
    ? "/healthz"
    : url.pathname.slice(PREFIX.length) || "/";
  return handleAsNodeRequest(PORT, new Request(url.toString(), request));
}
