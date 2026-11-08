# Music site deployment

The music hostname is isolated from the existing site:

- Web app: `music.qianzhi.pw`
- Runtime/build environment: Node.js 24+
- Hosting runtime: Cloudflare Workers + Static Assets
- Worker name: `qianzhi-music`
- Source: Folia `v0.7.26`, pinned in `music/folia`

## Build locally

From the repository root:

```bash
git submodule update --init --recursive
cd music/folia
npm ci
VITE_QQ_API_BASE=/api/qq npm run build
```

This compiles Folia's web assets and Worker entry. It does not deploy the site.

To publish the preview Worker (after authenticating Wrangler with the target Cloudflare account):

```bash
npx wrangler@4.120.0 deploy --config ../wrangler.jsonc
```

The first verified deployment should be tested on its `workers.dev` hostname before relying on the production custom domain.

## Cloudflare secrets

Before publishing, create a long random server-side secret and add it with Wrangler:

```bash
openssl rand -hex 32
npx wrangler@4.120.0 secret put QQ_SESSION_SECRET --config ../wrangler.jsonc
npx wrangler@4.120.0 deploy --config ../wrangler.jsonc
```

Do not put `QQ_SESSION_SECRET` in `VITE_*` variables, frontend source, Git, or public build logs. After adding the secret, redeploy the Worker.

## Preview and production

First publish to the Worker preview/`workers.dev` address and verify:

- `/healthz` and static app loading
- `/api/qq/login/channels`
- NetEase, Kugou and QQ search/playback behavior
- lyrics, playlist and mobile touch interactions
- login/session persistence and error handling

Only after those checks should the custom domain `music.qianzhi.pw` be attached. Wrangler's custom-domain route will create the DNS record; do not add a conflicting CNAME record manually.

The Sync Server is a separate service and is not included in this first Web Worker. It needs a separate Worker, D1 database, `SYNC_TOKEN`, and a separate hostname/configuration. Do not expose its token in the browser.

## Safety and scope

This build does not modify the existing `qianzhi.pw` or `admin.qianzhi.pw` Workers. It also does not modify the production Supabase database.

No production deployment should be considered complete until the build and provider checks above pass.
