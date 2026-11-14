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


const hardening = read('supabase/migrations/20261115020000_admin_console_security_hardening.sql');
const securityCenter = read('src/components/AdminSecurityCenter.tsx');
const adminShared = read('src/pages/admin/shared.ts');

assert.match(login, /record_auth_login_failure[\\s\\S]*?p_method: 'admin'/,
  'admin password login failures must be counted without recording credentials');
assert.match(login, /alog\\('admin_login_success'/,
  'successful admin login must be audited only after the admin assurance check');
assert.match(hardening, /method in \\('email', 'username', 'admin'\\)/,
  'login telemetry must distinguish admin password login failures');
assert.match(hardening, /function public\\.admin_list_own_sessions[\\s\\S]*?s\\.user_id = auth\\.uid\\(\\)/,
  'session inventory must be restricted to the current authenticated admin');
assert.match(hardening, /auth\\.jwt\\(\\) ->> 'session_id'/,
  'session inventory must identify the current session from the signed JWT');
assert.match(hardening, /insert into public\\.admin_audit_logs \\(actor, action, detail\\)[\\s\\S]*?values \\(auth\\.uid\\(\\)/,
  'admin audit records must populate the actor column from auth.uid');
assert.match(hardening, /revoke all on table public\\.admin_audit_logs from public, anon, authenticated/i,
  'direct client writes to audit logs must be revoked');
assert.match(securityCenter, /admin_list_own_sessions[\\s\\S]*?管理员登录设备/,
  'security center must show the signed-in admin’s own sessions');
assert.match(securityCenter, /signOut\\(\\{ scope: 'others' \\}\\)/,
  'security center must retain supported revoke-other-sessions behavior');
assert.match(adminShared, /Promise<boolean>[\\s\\S]*?return false/,
  'audit helper must report whether the write succeeded');

console.log('Admin security regression checks passed.');
