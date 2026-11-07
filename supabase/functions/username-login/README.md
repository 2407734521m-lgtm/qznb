# Username login rate limits

- 8 attempts per `(client IP, normalized username)` in a fixed 15-minute window.
- 60 total attempts per client IP per 15 minutes, including successful logins.
  Success clears only the pair budget. Shared networks/NAT share the IP budget.
- Unknown usernames and missing email mappings consume both budgets too. They
  perform the same two lookups and one Auth request as wrong-password attempts,
  then return `invalid_credentials` with the same 800–900 ms minimum delay.
  This mitigates timing differences; it does not guarantee constant-time network IO.
- Only SHA-256 hashes are stored; neither raw IPs nor usernames are persisted in
  limiter tables. Expired rows are removed on subsequent requests after 24 hours.
- There is intentionally no cross-IP username lockout: such a limit would allow
  an attacker to deny service to a known username again.

## Gateway requirement

The function prefers `CF-Connecting-IP`, then the first `X-Forwarded-For` entry.
**Only deploy behind an ingress that overwrites/sanitizes these headers.** They
are not inherently authenticated by the function. Confirm this for your hosted
Supabase endpoint/custom domain before relying on per-IP enforcement, and test
that client-supplied forwarding headers cannot change the bucket. Otherwise a
caller could spoof/rotate IP keys. Missing or invalid IP metadata fails closed
with `unavailable` (503), rather than bypassing limits or using one shared bucket.

## Tests

```sh
npm ci
npm run typecheck
npm run build
deno check --node-modules-dir=auto --no-lock supabase/functions/username-login/index.ts supabase/functions/username-login/handler_test.ts
deno test --node-modules-dir=auto --no-lock --allow-env supabase/functions/username-login/handler_test.ts
```

SQL assertions (only in a **disposable local test database** with migrations
applied, using a superuser that can `SET ROLE service_role`):

```sh
psql "$LOCAL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/username_login_rate_limit.sql
```

## After merging

In the correct linked Supabase project, apply the migration **then immediately**
redeploy the function:

```sh
supabase db push --remote --skip-vault
supabase functions deploy username-login
```

These commands match the current CLI (`db push` defaults to local; `--remote`
targets the linked project, and `--skip-vault` avoids unrelated secret updates).
Check `supabase db push --help` if using an older CLI.

The migration removes the old username-only RPC. Between migration and function
redeployment, old function instances fail closed (`unavailable`). Plan a brief
maintenance window; do not deploy the new function before the new migration.
Verify a normal username login, generic wrong-password/unknown-user errors,
and that exhausting a pair quota does not block the same username from a second
IP. Supabase Auth has its own limits which this application limiter does not
replace. Neither production migration nor deployment is part of this PR.
