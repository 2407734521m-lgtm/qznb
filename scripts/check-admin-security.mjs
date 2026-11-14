import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const supabaseClient = read('src/lib/supabase.ts');
const login = read('src/pages/AdminLogin.tsx');
const settings = read('src/components/AdminMfaSecurity.tsx');
const admin = read('src/pages/Admin.tsx');
const mfaSqlTest = read('scripts/test-admin-mfa-sql.mjs');
const appShell = read('src/main.tsx');

assert.match(supabaseClient, /isDedicatedAdminHost[\s\S]*?experimental:\s*\{\s*recoveryCodes:\s*true\s*\}/,
  'recovery codes experimental API must be enabled only for the dedicated admin host');
assert.match(login, /signInWithPassword/,
  'admin login must authenticate with the account password');
assert.match(login, /admin_login_is_admin/,
  'admin login must verify the signed-in account role on the server');
assert.match(login, /rpc\\('my_role'\\)/,
  'admin login must confirm the effective server-side role before entering');
assert.doesNotMatch(login, /supabase\\.auth\\.mfa|totp|恢复码|双重验证/i,
  'the administrator login screen must not render or run TOTP/recovery-code steps');
assert.match(appShell, /if \(loading\) return <DelayedPageSkeleton \/>;/,
  'the initial auth loading state may show a skeleton');
assert.doesNotMatch(appShell, /if \(loading \|\| \(session && \(role === null \|\| verifiedUid !== session\.user\.id\)\)\) return <DelayedPageSkeleton \/>;/,
  'role lookup must not unmount the password login flow after password sign-in');
assert.match(appShell, /if \(!isAdmin\)[\s\S]*?<AdminLogin showBack=\{false\} onAuthenticated=/,
  'the login component must stay rendered while a password-authenticated session awaits role resolution');
const passwordOnlyGate = read('supabase/migrations/20261115030000_admin_password_only_login.sql');
assert.match(passwordOnlyGate, /select p\\.role[\\s\\S]*?where p\\.id = auth\\.uid\\(\\)/,
  'the updated server role gate must return only the signed-in user profile role');
assert.doesNotMatch(passwordOnlyGate, /aal|amr|totp/i,
  'the password-only role gate must not depend on MFA assurance or TOTP claims');
assert.match(mfaSqlTest, /password-authenticated aal1 admin must receive the configured admin role/,
  'database regression test must allow password-authenticated aal1 admin sessions');
assert.match(mfaSqlTest, /ordinary member cannot gain admin role/,
  'database regression test must continue denying ordinary members');

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

assert.ok(login.includes("p_method: 'admin'"), 'admin password login failures must be counted without recording credentials');
assert.ok(login.includes("alog('admin_login_success'"), 'successful admin login must be audited after assurance checks');
assert.ok(hardening.includes("check (method in ('email', 'username', 'admin'))"), 'login telemetry must distinguish admin password login failures');
assert.ok(hardening.includes('function public.admin_list_own_sessions()'), 'database must expose a protected session inventory RPC');
assert.ok(hardening.includes('s.user_id = auth.uid()'), 'session inventory must be restricted to the current authenticated admin');
assert.ok(hardening.includes("auth.jwt() ->> 'session_id'"), 'session inventory must identify the current session from the signed JWT');
assert.ok(hardening.includes('insert into public.admin_audit_logs (actor, action, detail)'), 'admin audit records must populate the actor column');
assert.ok(hardening.includes('revoke all on table public.admin_audit_logs from public, anon, authenticated'), 'direct client writes to audit logs must be revoked');
assert.ok(securityCenter.includes("admin_list_own_sessions") && securityCenter.includes('管理员登录设备'), 'security center must show the signed-in admin’s own sessions');
assert.ok(securityCenter.includes("signOut({ scope: 'others' })"), 'security center must retain supported revoke-other-sessions behavior');
assert.ok(adminShared.includes('Promise<boolean>') && adminShared.includes('return false'), 'audit helper must report whether the write succeeded');

console.log('Admin security regression checks passed.');
