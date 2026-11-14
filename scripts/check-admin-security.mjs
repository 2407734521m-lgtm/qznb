import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const supabaseClient = read('src/lib/supabase.ts');
const login = read('src/pages/AdminLogin.tsx');
const settings = read('src/components/AdminSecondaryPassword.tsx');
const admin = read('src/pages/Admin.tsx');
const pinGate = read('supabase/migrations/20261115030500_admin_secondary_pin_gate.sql');
const pinSqlTest = read('scripts/test-admin-secondary-pin-sql.mjs');
const appShell = read('src/main.tsx');

assert.match(supabaseClient, /storageKey:\s*'qznb-admin-auth-v1'/,
  'the dedicated admin origin must keep its own auth session');
assert.doesNotMatch(supabaseClient, /experimental:\s*\{\s*recoveryCodes/,
  'the admin client must not enable the TOTP recovery-code API anymore');

assert.doesNotMatch(login, /\.mfa\.|totp|TOTP|recoveryCodes|recovery code/i,
  'admin login must not invoke TOTP or recovery-code flows');
assert.match(login, /admin_secondary_password_status/,
  'admin login must determine whether a secondary PIN needs first-time setup');
assert.match(login, /admin_set_secondary_password/,
  'first admin login must set a six-digit secondary PIN');
assert.match(login, /admin_verify_secondary_password/,
  'admin login must verify the secondary PIN using the server RPC');
assert.match(login, /password_and_secondary_pin/,
  'successful login must be audited with the new authentication method');
assert.match(login, /\^\\d\{6\}\$/,
  'the UI must accept exactly six numeric digits for the secondary PIN');

assert.match(pinGate, /extensions\.crypt\(p_pin, extensions\.gen_salt\('bf', 12\)\)/,
  'the six-digit PIN must be stored with a salted bcrypt hash');
assert.match(pinGate, /when v_attempts >= 5 then now\(\) \+ interval '15 minutes'/,
  'five failed PIN attempts must trigger a temporary lockout');
assert.match(pinGate, /auth\.jwt\(\) ->> 'session_id'/,
  'the verified PIN must be tied to the signed-in Supabase session');
assert.match(pinGate, /now\(\) \+ interval '8 hours'/,
  'the verified session must expire automatically');
assert.match(pinGate, /create or replace function public\.my_role\(\)[\s\S]*?admin_secondary_verified_sessions/,
  'the database role gate must authorize admins only after server-side PIN verification');
assert.doesNotMatch(pinGate, /aal2|amr|totp/i,
  'the replacement role gate must not depend on TOTP or AAL2');
assert.match(pinSqlTest, /another session for the same admin must remain locked/,
  'database regression test must prove PIN verification is session-scoped');
assert.match(pinSqlTest, /five failed attempts trigger a 15-minute account lock/,
  'database regression test must cover PIN lockout');

assert.match(settings, /admin_change_secondary_password/,
  'the admin account security page must support changing the secondary PIN');
assert.match(settings, /currentPin[\s\S]*?newPin[\s\S]*?confirmPin/,
  'PIN changes must require the current PIN and confirmation of the new PIN');
assert.doesNotMatch(settings, /\.mfa\.|totp|TOTP|recoveryCodes/i,
  'the admin account security page must no longer expose TOTP/recovery-code management');
assert.match(admin, /tab === 'mySecurity'[\s\S]*?<AdminSecondaryPassword \/>/,
  'the account security tab must render the secondary PIN manager');

assert.match(appShell, /if \(loading\) return <DelayedPageSkeleton \/>;/,
  'the initial auth loading state may show a skeleton');
assert.doesNotMatch(appShell, /if \(loading \|\| \(session && \(role === null \|\| verifiedUid !== session\.user\.id\)\)\) return <DelayedPageSkeleton \/>;/,
  'role lookup must not unmount the secondary PIN login flow');
assert.match(appShell, /if \(!isAdmin\)[\s\S]*?<AdminLogin showBack=\{false\} onAuthenticated=/,
  'the login component must stay rendered while the session awaits PIN verification');

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

console.log('Admin secondary PIN security regression checks passed.');
