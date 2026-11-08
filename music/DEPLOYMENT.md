# Music site deployment

The music hostname is isolated from the existing site:

- Web app: `music.qianzhi.pw`
- Runtime/build environment: Node.js 24+
- Hosting runtime: Cloudflare Workers + Static Assets
- Worker name: `qianzhi-music`
- Source: Folia `v0.7.27`, pinned in `music/folia`

## Build locally

From the repository root:

```bash
git submodule update --init --recursive
node music/scripts/apply-folia-mobile-gestures.mjs
node music/scripts/apply-qianzhi-account.mjs
cd music/folia
npm ci
npm install --no-save --package-lock=false --ignore-scripts @supabase/supabase-js@2.119.0
npm run typecheck
npm run test:unit -- test/unit/components/playerSwipe.test.ts
npm run test:unit -- test/unit/qianzhiAccount/loginMethod.test.ts
VITE_QQ_API_BASE=/api/qq VITE_QZNB_SUPABASE_URL=https://ldypnxxxgscibopgiaso.supabase.co VITE_QZNB_SUPABASE_ANON_KEY=<your-public-anon-key> npm run build
```

The overlay script applies the pinned Lark swipe resolver to Folia's existing mobile player capsule. It adds horizontal previous/next navigation, upward expansion and downward collapse without replacing Folia's playback store or adding a second player UI. It also writes a focused unit test; the original Lark source remains under `music/vendor/lark/`.

This compiles Folia's web assets and Worker entry. It does not deploy the site.

To publish the preview Worker (after authenticating Wrangler with the target Cloudflare account), from `music/folia`:

```bash
npx wrangler@4.120.0 deploy --config ../wrangler.jsonc
```

The first verified deployment should be tested on its `workers.dev` hostname before relying on the production custom domain.

## Qianzhi account connection

The optional account row appears in Folia Settings → Help → About. It uses the same Supabase Auth project and user IDs as the main site, supports email login and the main site's username-login function, and saves its session under a separate `qznb-music-auth-v1` storage key. Signing out from the music site clears only its local session; it does not sign out the main site. This is shared authentication, not seamless single sign-on: the user signs in once on the music hostname. Music playback remains available without an account.

Before production deployment, add the project's public anon/publishable key as the GitHub Actions repository secret `QZNB_SUPABASE_ANON_KEY`. It is a browser-visible public key, not a service-role key. Never use `SUPABASE_SERVICE_ROLE_KEY` or any privileged server key in this frontend build. The Supabase URL is already configured in the workflow.

## Cloudflare secrets

Before publishing, create a long random server-side secret and add it with Wrangler. The GitHub deployment workflow also requires `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `QQ_SESSION_SECRET`, and `QZNB_SUPABASE_ANON_KEY` repository secrets:

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
