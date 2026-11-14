import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const supabaseClient = read('src/lib/supabase.ts');
const login = read('src/pages/AdminLogin.tsx');
const settings = read('src/components/AdminSecondaryPassword.tsx');
const admin = read('src/pages/Admin.tsx');
const pinGate = read('supabase/migrations/20261115030500_admin_secondary_pin_gate.sql');
const pinSqlTest = read('scripts/test-admin-secondary-pin-sql.mjs');
const appShell = read('src/main.tsx');

assert.ok(supabaseClient.includes("storageKey: 'qznb-admin-auth-v1'"),
  'the dedicated admin origin must keep its own auth session');
assert.equal(supabaseClient.includes('recoveryCodes'), false,
  'the admin client must not enable the TOTP recovery-code API anymore');

assert.equal(login.includes('.mfa.'), false,
  'admin login must not invoke Supabase MFA');
assert.equal(login.toLowerCase().includes('totp'), false,
  'admin login must not contain the old authenticator flow');
assert.ok(login.includes('admin_secondary_password_status'),
  'admin login must determine whether a secondary PIN needs first-time setup');
assert.ok(login.includes('admin_set_secondary_password'),
  'first admin login must set a six-digit secondary PIN');
assert.ok(login.includes('admin_verify_secondary_password'),
  'admin login must verify the secondary PIN using the server RPC');
assert.ok(login.includes('password_and_secondary_pin'),
  'successful login must be audited with the new authentication method');
assert.ok(login.includes("slice(0, 6)"),
  'the UI must limit secondary PIN entry to six digits');
assert.ok(login.includes('admin_login_is_admin'),
  'the login flow must verify the signed-in account admin role before requesting a PIN');

assert.ok(pinGate.includes("extensions.crypt(p_pin, extensions.gen_salt('bf', 12))"),
  'the six-digit PIN must be stored with a salted bcrypt hash');
assert.ok(pinGate.includes("when v_attempts >= 5 then now() + interval '15 minutes'"),
  'five failed PIN attempts must trigger a temporary lockout');
assert.ok(pinGate.includes("auth.jwt() ->> 'session_id'"),
  'the verified PIN must be tied to the signed-in Supabase session');
assert.ok(pinGate.includes("now() + interval '8 hours'"),
  'the verified session must expire automatically');
assert.ok(pinGate.includes('admin_secondary_verified_sessions'),
  'the database role gate must authorize admins only after server-side PIN verification');
assert.equal(/aal2|amr|totp/i.test(pinGate), false,
  'the replacement role gate must not depend on TOTP or AAL2');
assert.ok(pinSqlTest.includes('another session for the same admin must remain locked'),
  'database regression test must prove PIN verification is session-scoped');
assert.ok(pinSqlTest.includes('changing the PIN must revoke other devices'),
  'database regression test must prove PIN rotation revokes other verified sessions');
assert.ok(pinSqlTest.includes('five failed attempts trigger a 15-minute account lock'),
  'database regression test must cover PIN lockout');
assert.ok(pinSqlTest.includes('20261115030000_admin_password_only_login.sql'),
  'the SQL regression test must cover the migration already present on main before applying the PIN gate');

assert.ok(settings.includes('admin_change_secondary_password'),
  'the admin account security page must support changing the secondary PIN');
assert.ok(settings.includes('currentPin') && settings.includes('newPin') && settings.includes('confirmPin'),
  'PIN changes must require the current PIN and confirmation of the new PIN');
assert.equal(/\.mfa\.|totp|recoveryCodes/i.test(settings), false,
  'the admin account security page must no longer expose TOTP/recovery-code management');
assert.ok(admin.includes("{tab === 'mySecurity' && <AdminSecondaryPassword />}"),
  'the account security tab must render the secondary PIN manager');

assert.ok(appShell.includes('if (loading) return <DelayedPageSkeleton />;'),
  'the initial auth loading state may show a skeleton');
assert.ok(appShell.includes('<AdminLogin showBack={false} onAuthenticated='),
  'the login component must stay rendered while the session awaits PIN verification');

assert.ok(admin.includes('Date.now() - lastActivity >= 20 * 60 * 1000'),
  'admin UI must enforce the configured idle sign-out threshold');
assert.ok(admin.includes("signOut({ scope: 'local' })"),
  'idle sign-out must end the current local admin session');
assert.ok(admin.includes('qz_admin_idle_logout'),
  'idle sign-out must explain why the next login is required');

const hardening = read('supabase/migrations/20261115020000_admin_console_security_hardening.sql');
const securityCenter = read('src/components/AdminSecurityCenter.tsx');
const adminShared = read('src/pages/admin/shared.ts');
assert.ok(login.includes("p_method: 'admin'"), 'admin login failures must be counted without recording credentials');
assert.ok(login.includes("alog('admin_login_success'"), 'successful admin login must be audited after PIN verification');
assert.ok(hardening.includes("check (method in ('email', 'username', 'admin'))"), 'login telemetry must distinguish admin login failures');
assert.ok(hardening.includes('function public.admin_list_own_sessions()'), 'database must expose a protected session inventory RPC');
assert.ok(hardening.includes('s.user_id = auth.uid()'), 'session inventory must be restricted to the current authenticated admin');
assert.ok(hardening.includes("auth.jwt() ->> 'session_id'"), 'session inventory must identify the current session from the signed JWT');
assert.ok(hardening.includes('insert into public.admin_audit_logs (actor, action, detail)'), 'admin audit records must populate the actor column');
assert.ok(hardening.includes('revoke all on table public.admin_audit_logs from public, anon, authenticated'), 'direct client writes to audit logs must be revoked');
assert.ok(securityCenter.includes('admin_list_own_sessions') && securityCenter.includes('管理员登录设备'), 'security center must show the signed-in admin’s own sessions');
assert.ok(securityCenter.includes("signOut({ scope: 'others' })"), 'security center must retain supported revoke-other-sessions behavior');
assert.ok(adminShared.includes('Promise<boolean>') && adminShared.includes('return false'), 'audit helper must report whether the write succeeded');

console.log('Admin secondary PIN security regression checks passed.');
