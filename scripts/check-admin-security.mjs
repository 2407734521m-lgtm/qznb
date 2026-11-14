import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const supabaseClient = read('src/lib/supabase.ts');
const login = read('src/pages/AdminLogin.tsx');
const settings = read('src/components/AdminMfaSecurity.tsx');
const admin = read('src/pages/Admin.tsx');
const mfaGate = read('supabase/migrations/20261114150000_admin_totp_mfa_gate.sql');
const mfaSqlTest = read('scripts/test-admin-mfa-sql.mjs');
const appShell = read('src/main.tsx');

assert.match(supabaseClient, /isDedicatedAdminHost[\s\S]*?experimental:\s*\{\s*recoveryCodes:\s*true\s*\}/,
  'recovery codes experimental API must be enabled only for the dedicated admin host');
assert.match(login, /mfa\.recoveryCodes\.verify\(\{\s*code:\s*candidate\s*\}\)/,
  'admin login must validate recovery codes through Supabase Auth');
assert.match(login, /recoveryVerified[\s\S]*?beginReplacementTotpEnrollment\(\)/,
  'recovery-code sessions must proceed to replacement TOTP enrollment');
assert.match(login, /methods\.includes\('totp'\)/,
  'the login UI must require a TOTP AMR before finishing admin login');
assert.match(appShell, /if \(loading\) return <DelayedPageSkeleton \/>;/,
  'the initial auth loading state may show a skeleton');
assert.doesNotMatch(appShell, /if \(loading \|\| \(session && \(role === null \|\| verifiedUid !== session\.user\.id\)\)\) return <DelayedPageSkeleton \/>;/,
  'role lookup must not unmount the admin MFA login flow after password sign-in');
assert.match(appShell, /if \(!isAdmin\)[\s\S]*?<AdminLogin showBack=\{false\} onAuthenticated=/,
  'the login component must stay rendered while a non-TOTP session awaits role resolution');
assert.match(mfaGate, /@> '\[\{"method":"totp"\}\]'::jsonb/,
  'the server role gate must continue to require the signed TOTP AMR');
assert.doesNotMatch(mfaGate, /mfa\/recovery_code/,
  'recovery-code AMR must not directly unlock the admin role');
assert.match(mfaSqlTest, /mfa\/recovery_code[\s\S]*?must not grant admin access/,
  'database regression test must deny recovery-code-only admin sessions');

assert.match(settings, /recoveryCodes\.generate/,
  'admin account security page must support one-time recovery-code generation');
assert.match(settings, /recoveryCodes\.regenerate/,
  'admin account security page must support recovery-code rotation');
assert.match(settings, /mfa\.challenge\(\{ factorId: factor\.id \}\)[\s\S]*?mfa\.verify\(/,
  'recovery-code generation and rotation must be preceded by a fresh TOTP challenge');
assert.match(settings, /admin_recovery_codes_generated[\s\S]*?data\.total/,
  'recovery-code audit event may include the count but not the plaintext codes');
assert.doesNotMatch(settings, /localStorage|sessionStorage|console\.log/,
  'recovery-code plaintext must not be persisted or logged by the UI');

assert.match(admin, /Date\.now\(\) - lastActivity >= 20 \* 60 \* 1000/,
  'admin UI must enforce the configured idle sign-out threshold');
assert.match(admin, /signOut\(\{ scope: 'local' \}\)/,
  'idle sign-out must end the current local admin session');
assert.match(admin, /qz_admin_idle_logout/,
  'idle sign-out must explain why the next login is required');

console.log('Admin security regression checks passed.');
