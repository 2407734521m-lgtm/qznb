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
For a connector deployment send `index.ts` AND `handler.ts`, and keep
`verify_jwt=false`; there are no other relative runtime imports/import maps.

Apply both migrations, then immediately deploy in a brief maintenance window.
The first migration removes the old RPC: old function deployments fail closed
until redeployment. Do not deploy the previous IP-only function between them.
Verify migration history, function version/config, security advisors, and a
made-up username's generic failure; do not exhaust a real user's budget. Confirm
that rotating IP headers cannot change the username hash or bypass the account
ceiling/backoff. Live integration and ingress testing are still required.
