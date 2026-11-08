# Music site deployment

The music hostname is isolated from the existing site:

- Web app: `music.qianzhi.pw`
- Runtime/build environment: Node.js 24+
- Hosting runtime: Cloudflare Workers + Static Assets
- Production Worker: `qianzhi-music`
- Preview Worker: `qianzhi-music-preview`
- Source: Folia `v0.7.27`, pinned in `music/folia`

## Build locally

From the repository root:

```bash
git submodule update --init --recursive
node music/scripts/apply-folia-mobile-gestures.mjs
node music/scripts/apply-qianzhi-account.mjs
cd music/folia
npm ci
cd ../..
node music/scripts/apply-folia-netease-workers.mjs
cd music/folia
npm install --no-save --package-lock=false --ignore-scripts @supabase/supabase-js@2.119.0
npm run typecheck
npm run test:unit -- test/unit/components/playerSwipe.test.ts
npm run test:unit -- test/unit/qianzhiAccount/loginMethod.test.ts
VITE_QQ_API_BASE=/api/qq VITE_NETEASE_API_BASE=/api/netease VITE_QZNB_SUPABASE_URL=https://ldypnxxxgscibopgiaso.supabase.co VITE_QZNB_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY npm run build
```

The overlays apply the Lark swipe resolver to Folia's existing mobile player capsule and add the optional Qianzhi account row to Settings → Help → About. The music account uses the same Supabase Auth user pool as the main site, but it stores a separate local session. It is not seamless SSO; a user signs in once on the music hostname. Music playback remains available without an account.

The Supabase browser client is pinned at `@supabase/supabase-js@2.119.0`. The account panel requires the public anon/publishable key. Never supply a service-role key or any privileged server key to `VITE_*` variables.

## Preview first — no production DNS

The preview config is `music/wrangler.preview.jsonc`. It creates a separate Worker named `qianzhi-music-preview` with `workers.dev` enabled and **no custom domain route**.

From `music/folia`, after authenticating Wrangler:

```bash
npx wrangler@4.120.0 deploy --config ../wrangler.preview.jsonc
```

The first deployed URL is the preview's `workers.dev` hostname. Verify this URL before touching the production hostname:

- `/healthz` and static app loading
- `/api/qq/login/channels`
- `/api/netease/healthz` reports the allowlisted upstream API routes
- NetEase QR login, search, song detail, playback URL and lyrics
- Kugou and QQ search/playback behavior
- lyrics, playlist and mobile touch interactions
- Qianzhi email and username login, session persistence, and local-only sign-out
- error states when the QQ service or Supabase is unavailable

The GitHub Actions workflow `.github/workflows/deploy-music.yml` is manual-only and has a required target choice. It defaults to **preview**. Select **production** only after the preview has been tested and explicitly approved; that target uses `music/wrangler.jsonc` and activates the `music.qianzhi.pw` custom domain.

## Qianzhi account and GitHub secrets

Before production deployment, add the project's public anon/publishable key as the GitHub Actions repository secret `QZNB_SUPABASE_ANON_KEY`. It is a browser-visible public key, not a service-role key. The Supabase URL is configured in the workflow.

The manual deployment workflow requires these repository secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `QQ_SESSION_SECRET`
- `QZNB_SUPABASE_ANON_KEY`

Do not put `QQ_SESSION_SECRET` in `VITE_*` variables, frontend source, Git, or public build logs. It is stored as a Cloudflare Worker secret for whichever target you publish.

## Sync server

The Sync Server is a separate service and is not included in this first Web Worker. It needs a separate Worker, D1 database, `SYNC_TOKEN`, and a separate hostname/configuration. Do not expose its token in the browser.

## Safety and scope

The preview and production music Workers are separate from the existing `qianzhi.pw` and `admin.qianzhi.pw` Workers. The music deployment does not modify the production Supabase schema.

No production deployment should be considered complete until preview, provider, account and mobile checks pass.
