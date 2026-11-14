import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = relative => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
const migration = read('supabase/migrations/20261114101500_priority_reliability_privacy_fixes.sql');
const chat = read('src/pages/Chat.tsx');
const email = read('supabase/functions/email-dispatch/index.ts');
const loveWall = read('src/pages/LoveWall.tsx');
const adminLove = read('src/components/AdminLoveWall.tsx');
const adminReview = read('src/components/AdminReviewCenter.tsx');
const guestLove = read('src/pages/GuestLoveWall.tsx');
const login = read('src/pages/Login.tsx');
const packageJson = JSON.parse(read('package.json'));

assert.match(migration, /coalesce\(cm\.last_read_message_id, 0\) < v_last_message_id/,
  'mark_conversation_read must skip unchanged read-cursor updates');
assert.match(chat, /payload\.new[\s\S]{0,100}profile_id[\s\S]{0,30}!== me/,
  'chat must ignore its own conversation_members Realtime update');

assert.match(migration, /revoke select on table public\.love_wall_media from public, anon, authenticated/i,
  'raw attachment rows must not be directly readable by client roles');
assert.match(migration, /revoke select \(id, post_id, path, kind, sort, created_at\)[\s\S]*?from public, anon, authenticated/i,
  'historical column-level SELECT grants must be revoked too');
assert.match(migration, /love_wall_media_for_posts/,
  'client media reads must use the privacy-aware RPC');
assert.match(migration, /lp\.status = 'published'[\s\S]*?not coalesce\(lp\.is_anonymous, true\)/,
  'legacy anonymous media paths must be masked from published-post readers');
assert.match(migration, /create or replace function guest_api_private\.love_wall_media_public_readable[\s\S]*?not coalesce\(lp\.is_anonymous, true\)/,
  'guest Storage access must reject legacy anonymous UUID paths too');
for (const [name, source] of [['LoveWall', loveWall], ['AdminLoveWall', adminLove], ['AdminReviewCenter', adminReview], ['GuestLoveWall', guestLove]]) {
  assert.doesNotMatch(source, /from\(['"]love_wall_media['"]\)\s*\.select/,
    `${name} must not select raw media paths directly`);
  assert.match(source, /love_wall_media_for_posts|love_wall_media_paths_referenced/,
    `${name} should use a privacy-aware media RPC`);
}
assert.match(loveWall, /love\/\$\{crypto\.randomUUID\(\)\}/,
  'new confession uploads must use opaque random paths');

assert.match(migration, /add column if not exists claim_token uuid/i,
  'email delivery logs need a claim token column');
assert.match(email, /\.eq\('updated_at', existing\.updated_at\)/,
  'email retry acquisition must compare-and-swap the row snapshot');
assert.ok((email.match(/\.eq\('claim_token', claimToken\)/g) ?? []).length >= 3,
  'all email terminal-state writes must be guarded by the active claim token');
for (const file of [
  'supabase/functions/maintenance-notify/index.ts',
  'supabase/functions/admin-bulk-email/index.ts',
  'supabase/functions/dev-feedback/index.ts',
]) {
  assert.match(read(file), /apikey:\s*serviceKey/,
    `${file} must authenticate internal email-dispatch calls with the service key`);
}

assert.match(login, /PasswordField disabled=\{codeSent\} value=\{pw\}/,
  'password must not change after signup has sent the verification code');
assert.match(login, /type="checkbox" disabled=\{codeSent\} checked=\{policyAccepted\}/,
  'policy acceptance must not change after signup has been created');
assert.match(packageJson.scripts?.['check:priority-fixes'] ?? '', /check-priority-fixes/,
  'package.json must expose the priority regression check');

if (fs.existsSync(path.join(process.cwd(), 'dist/assets'))) {
  const jsFiles = fs.readdirSync(path.join(process.cwd(), 'dist/assets'))
    .filter(file => file.endsWith('.js'));
  assert.ok(jsFiles.length >= 10, `expected lazy page chunks, found ${jsFiles.length} JS file(s)`);
  const entry = jsFiles.find(file => file.startsWith('index-'));
  assert.ok(entry, 'Vite entry JS file is missing');
  const entryBytes = fs.statSync(path.join(process.cwd(), 'dist/assets', entry)).size;
  assert.ok(entryBytes < 700_000, `entry JS is ${entryBytes} bytes; expected route code splitting`);
}

console.log('Priority regression checks passed.');
