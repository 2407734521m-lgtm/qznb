# Username login defenses

## Authoritative account budget (does not use IP headers)

- **30 failed or pending password checks per normalized username per fixed hour**.
  Unknown usernames and missing email mappings use exactly the same protocol.
  The account key is `SHA256(JSON.stringify(['username', normalizedUsername]))`;
  changing CF/XFF headers never changes it.
- First four failures have no additional cooldown. Starting with failure 5,
  database-enforced backoff is **1, 2, 4, 8, 16, 32, then 60 seconds** after each
  completion, capped at 60. A denied response stays HTTP 200 with the existing
  `code: 'rate_limited'`, plus `retry_after_ms` and a `Retry-After` header. Clients
  cannot bypass the delay by ignoring that field: the next request is checked
  against the database deadline before any password verification.
- Thirty is close to the old 8-per-15-min budget (about 32/hour), balancing
  normal typing mistakes against online guessing; unlike the
  former 8-attempt account-wide instant lock, reaching 30 requires about twenty
  minutes of enforced cooldown. Fixed hourly windows and cooldowns are **never
  extended by rejected requests**. A verified successful login resets only its
  username budget and IP/account pair, not the IP-wide budget.
- **One outstanding reservation per username**, with a 30-second worker lease.
  Checks are charged before Auth so simultaneous requests cannot all pass a
  post-failure counter. An abandoned/crashed check retains its charge and waits
  at least the lease or current backoff, whichever is longer. Only the matching
  one-time token can complete it; stale/duplicate completions cannot reset a
  newer check. Infrastructure failures conservatively retain the reservation.
- A known-username denial of service remains possible with sustained effort.
  This is an explicit tradeoff, not a claim to eliminate account lockout. Users
  can use the existing email-login path; stronger abuse recovery would need a
  separate verified challenge/CAPTCHA/MFA design. This limiter protects the
  **username-login function**, not direct calls to Supabase Auth/email login.

## Additional IP layers

- 8 attempts per `(client IP, normalized username)` per fixed 15 minutes.
- 60 total attempts per client IP per 15 minutes, including successes. Shared
  networks/NAT share this IP budget.
- IP metadata remains best-effort. The function prefers `CF-Connecting-IP`, then
  the first `X-Forwarded-For` entry, validates/normalizes it, and stores hashes.
  **No official hosted Edge Functions header-sanitization guarantee was found**.
  Treat both as potentially spoofable; they are never the only safeguard.
  In particular an attacker who can spoof a victim's IP may also consume that
  IP's extra budget. Confirm ingress behavior for the actual deployment.
- Supabase's documented `Sb-Forwarded-For` trusted-IP mechanism applies to Auth,
  requires an explicit setting and secret API key, and is NOT proof that CF/XFF
  is trustworthy here: https://supabase.com/docs/guides/auth/rate-limits
- Missing or malformed IP metadata still fails closed with `unavailable` (503).

## Failure/privacy compatibility

Unknown users, missing email mappings, and wrong passwords do the same two
lookups and one Auth call (random reserved `.invalid` address for dummy logins),
then complete the same username reservation and return `invalid_credentials`
with the same 800–900 ms minimum duration. Network IO is not constant-time.
Session, unconfirmed-email and existing frontend error shapes remain compatible.
Only hashes are stored in limiter tables, not raw IPs, usernames or credentials.
Expired rows are removed on subsequent requests after 24 hours. RLS stays enabled
and RPC execution is service_role-only, using SECURITY INVOKER.

## Tests

```sh
npm ci
npm run typecheck
npm run build
deno check --node-modules-dir=auto --no-lock supabase/functions/username-login/index.ts supabase/functions/username-login/handler_test.ts
deno test --node-modules-dir=auto --no-lock --allow-env supabase/functions/username-login/handler_test.ts
```

SQL assertions, only in a **disposable local database** after migrations, using
a superuser able to `SET ROLE service_role`:

```sh
psql "$LOCAL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/username_login_rate_limit.sql
psql "$LOCAL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/username_login_account_backoff.sql
```

## After merging (not performed by this PR)

1. Confirm the target project and compare migration history. Production had NOT
   applied `20261107031551_fix_username_login_rate_limit` when this follow-up was
   prepared. Both that migration and the new
   `20261107034642_add_username_login_account_backoff` must be applied **in that
   order**, unchanged; no historical migration was edited. If any other migration
   is missing, stop and reconcile it separately rather than bulk-applying it.
2. Only when those are the only pending migrations, on the correct linked project:

```sh
supabase db push --remote --skip-vault
supabase functions deploy username-login --no-verify-jwt
```

These match the current CLI; check `--help` with older versions. `--remote`
selects the linked project, `--skip-vault` avoids unrelated secret updates.
Production currently has `verify_jwt=false`; the deploy command preserves it.
For a connector deployment send `index.ts`, `handler.ts`, `device-cookie.ts` AND `recovery.ts`, and keep
`verify_jwt=false`; there is no import map; include every relative runtime dependency above.

Apply both migrations, then immediately deploy in a brief maintenance window.
The first migration removes the old RPC: old function deployments fail closed
until redeployment. Do not deploy the previous IP-only function between them.
Verify migration history, function version/config, security advisors, and a
made-up username's generic failure; do not exhaust a real user's budget. Confirm
that rotating IP headers cannot change the username hash or bypass the account
ceiling/backoff. Live integration and ingress testing are still required.


## Follow-up to merged PR #277: trusted devices and conditional recovery

### Trusted private devices

- Explicit opt-in **after successful username + password authentication** creates
  a random 256-bit device secret. Only SHA-256 is persisted. The secret goes only
  in a host-only `__Host-qznb-login-device` cookie: `Secure; HttpOnly;
  SameSite=Strict; Path=/; Max-Age=2592000` (**30 days**, not sliding).
- No JSON/localStorage/sessionStorage/IndexedDB secret fallback. One current
  account cookie per browser origin; up to five active tokens per account.
  Cross-origin previews intentionally cannot use this feature.
- A valid, unexpired, non-revoked token bound to the exact account uses an
  independent **10 failures/pending attempts/hour** budget. From failure 3,
  cooldown is 1, 2, 4, 8, then 15 seconds (cap). The usual 30/hour username
  budget cannot be used by outsiders to exhaust this private budget. Both
  normal IP limits still apply, with a separate device+IP pair namespace.
- The token NEVER replaces password verification. At most one password check
  per device budget may be in flight, using the existing 30-second lease/token
  protocol. Correct password clears only the budget it actually used.
- Current-browser revocation is available on Login; authenticated account
  security offers revoke-all. The latter obtains identity from `getUser`, not
  caller-supplied IDs. Revocation does not sign out active Auth sessions.
- Device validity checks a second-order credential fingerprint in a narrow
  private SECURITY DEFINER helper, not direct service-role password-table
  grants. Password change, deletion, ban, expiry or revocation invalidates the
  token. The fingerprint and token hashes are never returned to browsers.

### Architecture/XSS boundaries

The existing browser app uses a same-origin `/api` proxy on its canonical HTTPS
site. The proxy source is not in this repo; **before enabling, verify that it
preserves the browser Origin/Sec-Fetch-Site/Cookie to this function and Set-Cookie back without rewriting
its safety attributes or logging secrets**. Only explicitly allowlisted HTTPS
Origins with `Sec-Fetch-Site: same-origin` can issue/use/revoke a cookie.
Missing metadata or a sibling-site request disables device operations. Wildcard credentialed CORS is NOT enabled.
Native clients can forge Origin, but cannot guess the cookie's random secret.
Browser cross-site requests cannot supply the Strict cookie or forge Origin.

The UI is gated by `VITE_USERNAME_TRUSTED_DEVICE_ENABLED=true` AND an HTTPS
same-origin API URL. Configure `USERNAME_LOGIN_COOKIE_ORIGINS` server-side as
comma-separated exact origins, no wildcard/trailing slash; empty means disabled.
Each host has its own host-only cookie. The UI warns against public computers.

HttpOnly reduces **secret extraction**, not the ability of active same-origin
XSS to make requests on the victim's behalf. Existing Auth sessions are already
JS-accessible in this SPA; this PR does not solve general XSS/session theft.
A stolen device cookie still requires a password and has a small independent
budget. IP spoofing/shared NAT can still exhaust the extra IP-wide layer.

### Email recovery is deliberately conditional, not a fake working feature

Read-only aggregate inspection on 2026-11-14 found 5 accounts, all QQ-shaped and
marked confirmed, matching all 5 private profile mappings; 0 obvious reserved-
domain/synthetic patterns and **0 recovery attestations**. No addresses or secret
values were read/returned. Shape/confirmed timestamps are **not proof** of real
mailbox control: admin imports/autoconfirm can produce those same values.

The code therefore sends only when ALL are true:

1. `USERNAME_EMAIL_RECOVERY_ENABLED=true` and a valid, operator-controlled HTTPS
   `USERNAME_LOGIN_REDIRECT_URL` is configured; no caller-provided redirect.
2. Exactly one profile and matching private email mapping, valid real-format QQ
   address, and Auth `email_confirmed_at` are present.
3. Fresh `admin.getUserById` has server-owned
   `app_metadata.username_recovery_email_sha256` equal to SHA-256 of that exact
   trimmed/lowercased email. NEVER derive authorization from user_metadata.
4. All account/IP/project and recipient quotas admit the request.

**Do not set that attestation merely because email_confirmed_at is populated.**
Before setting it, an operator must establish real mailbox ownership through a
controlled Supabase email confirmation/change challenge (secure email change,
including existing-address confirmation where applicable), preserve verification
evidence, and attest the exact current mailbox from trusted backend/admin code.
Email changes invalidate the attestation hash automatically by mismatch. Do not
bulk-attest imported accounts or let callers submit their own attestation.

This PR does NOT ship an email-binding wizard or prove delivery to existing
mailboxes. Synthetic/unbound/unattested accounts cannot recover this way and
must first complete that controlled binding prerequisite. Until then keep both
server flag and `VITE_USERNAME_EMAIL_RECOVERY_ENABLED` false; the Chinese UI
explicitly says email recovery is not enabled. This is an intentionally blocked
prerequisite, not a promise that existing users can receive links today.

### Anti-bombing / response privacy

Requests reserve before send, including unknown usernames, and always return the
same generic Chinese message/status with an 800–900 ms minimum. No email,
existence, eligibility, provider error, or remaining quota is disclosed. Sends
run in EdgeRuntime.waitUntil where available; network IO is not constant-time.
These limits protect this function only: direct Auth endpoints retain their own
SMTP/hook/project limits and must not be treated as covered by this middleware.
No automatic send retries are made (avoids duplicate mail after timeouts).

- Per normalized username: 3/24h, at least 10 minutes apart.
- Per actual recipient hash: 3/24h, at least 10 minutes apart, survives renaming.
- Per IP: 5 requests/hour (additional best-effort defense).
- Entire project: 20 eligible send attempts/hour and 100/24h, independent of
  IP/username. These are charged only AFTER mailbox/recipient eligibility, so
  random unknown usernames cannot consume the global mail budget.
- All are fixed windows; rejected requests do not extend a recipient deadline.
  Limits charge attempts, including unknown users/provider failures. This can
  cause temporary recovery denial under attack, intentionally favoring no mail
  flooding over guaranteed delivery. The ordinary password paths remain.

Transport is Supabase Auth `signInWithOtp`, `shouldCreateUser:false`, no new
Resend API integration. Existing Supabase SMTP/Send Email hook must be working
and approved before enabling. Magic Link template must include a one-use
`{{ .ConfirmationURL }}` (a template containing only an OTP code is insufficient
for this UI); redirect allowlist must contain the exact SPA URL. Current client
uses implicit session detection. If changing to PKCE, add a proper callback
exchange first; do not enable this server-generated-link implementation blindly.
Link expiry is Supabase Auth's setting (docs default 1 hour); configure/verify a
short appropriate value such as 10–15 min, aware it affects other email flows.
No config was read/changed or test email sent by this work.

References verified this turn:
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/testing-auth-flows
- https://supabase.com/docs/guides/auth/rate-limits

### Deploy order AFTER separate production approval

1. Backup and compare remote migration history. PR #277 is merged; do not assume
   its migrations are deployed. Ensure 026 -> 20261107031551 -> 20261107034642
   are already applied in order. Do not bulk-apply unrelated pending migrations.
2. Apply ONLY new `20261114021543_username_login_trusted_devices_and_recovery`
   after those prerequisites; no existing migration was changed.
3. Immediately deploy `username-login` with index.ts, handler.ts,
   device-cookie.ts and recovery.ts; preserve the actual deployed verify_jwt
   setting (last known false, recheck). No import map is used.
4. Configure/verify the same-origin proxy and exact cookie Origin allowlist;
   deploy the frontend. Enable its trusted-device build flag only after cookie
   and revoke/password-change behavior works on a non-production test account.
5. Separately complete mailbox binding/attestation, SMTP/hook, template,
   redirect and expiry prerequisites; only then enable both recovery flags and
   rebuild frontend (workflow reads the corresponding GitHub repository vars).
6. Use local Mailpit/mocked transport for tests; any real login email or live
   test/config write needs separate explicit approval. Check migration history,
   function version/config, RLS/grants and security advisors after deployment.

Run all three SQL suites reproducibly without a database connection:
`npm ci && npm run test:login-sql`. PGlite is an exact-pinned dev-only dependency.
Additional SQL suite: `supabase/tests/username_login_devices_recovery.sql`.
Tests use a disposable minimal PGlite fixture for Auth/profiles plus login
migrations; this is not a full Supabase stack, real SMTP/cookie-proxy integration
or multi-connection load test. No CAPTCHA was added. No production changes.
