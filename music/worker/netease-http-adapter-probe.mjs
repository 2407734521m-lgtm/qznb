import { createServer } from "node:http";
import express from "../folia/node_modules/express/index.js";
// Cloudflare exposes this runtime-only module when Node.js compatibility is enabled.
// @ts-ignore -- resolved by the Workers runtime, not by the local Node type package
import { handleAsNodeRequest } from "cloudflare:node";

const PORT = 3917;
const PREFIX = "/api/netease-adapter-probe";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.get("/healthz", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    ok: true,
    runtime: "cloudflare-workers-node-http",
    adapter: "handleAsNodeRequest",
    framework: "express",
    frameworkVersion: "5.2.1",
  });
});

app.post("/echo", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    ok: true,
    body: request.body ?? null,
    cookieForwarded: Boolean(request.get("cookie")),
  });
});

const server = createServer(app);
server.listen(PORT);

export async function handleNeteaseHttpAdapterProbe(request) {
  const target = new URL(request.url);
  target.pathname = target.pathname.slice(PREFIX.length) || "/healthz";

  const nodeRequest = new Request(target.toString(), request);
  return handleAsNodeRequest(PORT, nodeRequest);
}
