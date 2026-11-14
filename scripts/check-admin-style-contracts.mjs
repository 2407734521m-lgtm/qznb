import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const main=read('../src/main.tsx');
const admin=read('../src/pages/Admin.tsx');
const workspace=read('../src/components/AdminWorkspace.tsx');
const cinematic=read('../src/styles-admin-cinematic.css');
const unified=read('../src/styles-admin-unified.css');
const scaffold=read('../src/styles-admin-scaffold.css');
const ops=read('../src/styles-admin-ops.css');
const tokens=read('../src/styles-admin-tokens.css');
const pages=read('../src/styles-admin-pages.css');
const accounts=read('../src/components/AdminAccountManagement.tsx');
const notifications=read('../src/components/AdminNotificationCenter.tsx');
const moderate=read('../src/pages/admin/Moderate.tsx');
const analytics=read('../src/components/AdminAnalyticsCenter.tsx');
const approvals=read('../src/components/AdminApprovalCenter.tsx');
const security=read('../src/components/AdminSecurityCenter.tsx');
const system=read('../src/components/AdminSystemCenter.tsx');
const release=read('../src/components/AdminReleaseCenter.tsx');
const backup=read('../src/components/AdminBackupCenter.tsx');
const board=read('../src/pages/admin/BoardMgr.tsx');
const logs=read('../src/pages/admin/Logs.tsx');
const settings=read('../src/pages/admin/Settings.tsx');
function assert(ok,message){if(!ok){console.error(`Admin style contract failed: ${message}`);process.exitCode=1;}}
assert(main.includes("supabase.rpc('my_role')"),'dedicated host must verify the role before mounting admin');
assert(main.includes("setVerifiedUid(uid)")&&main.includes("verifiedUid !== session.user.id"),'role result must be bound to the active session user');
assert(main.includes("<Admin verifiedRole={role === 'super_admin' ? 'super_admin' : 'admin'} />"),'verified role must be passed to the admin page');
assert(!main.includes('我们的班级'),'admin title fallback must use current brand');
assert(admin.includes('className="admin-shell-v3"'),'admin page must use one isolated root class');
assert(!admin.includes("supabase.rpc('my_role')"),'admin page must not repeat the host role query');
assert(admin.includes("import '../styles-admin-tokens.css';"),'admin tokens must load after compatibility styles');
assert(workspace.includes('<strong>{BRAND_NAME}</strong>')&&!workspace.includes('青春档案'),'admin workspace must use current brand');
for(const [name,css] of [['cinematic',cinematic],['unified',unified],['scaffold',scaffold],['ops',ops]]){
 assert(!/\.admin-shell(?!-v3)\b/.test(css),`${name} CSS must use isolated admin root`);
}
const unscoped=/(^|[{},])\s*\.(admin-content|admin-header|admin-search|admin-loading-pulse)(?=\s|[>:#,.])/m;
for(const [name,css] of [['cinematic',cinematic],['unified',unified]]){
 assert(!unscoped.test(css),`${name} legacy selectors must stay under admin root`);
}
assert(tokens.includes('--admin-bg-0: #f7f9fc;')&&tokens.includes('--admin-surface: #ffffff;'),'admin tokens must define light surfaces');
assert(admin.includes("import '../styles-admin-pages.css';"),'admin page refinements must load from the admin entry');
assert(accounts.includes('className=\"admin-accounts-page\"'),'account page must have a local style root');
assert(notifications.includes('className=\"admin-notifications-page\"'),'notification page must have a local style root');
assert(moderate.includes('className=\"admin-moderation-page\"'),'moderation page must have a local style root');
assert(pages.includes('.admin-shell-v3 .admin-content .admin-overview-panel')&&pages.includes('.admin-shell-v3 .admin-content .admin-accounts-page'),'page refinements must be scoped to the admin shell');
assert(!/^\\s*\\.admin-(?:overview|accounts|notifications|moderation|email)/m.test(pages),'admin page CSS must not leak into public pages');
for(const [name,source,root] of [
 ['analytics',analytics,'admin-analytics-page'],['approvals',approvals,'admin-approvals-page'],
 ['security',security,'admin-security-page'],['system',system,'admin-system-page'],
 ['release',release,'admin-release-page'],['backup',backup,'admin-backup-page'],
 ['announcements',board,'admin-announcements-page'],['logs',logs,'admin-logs-page'],
 ['settings',settings,'admin-settings-page']
]) assert(source.includes(root),name+' page must expose an admin-local style root');
for(const root of [
 'admin-analytics-page','admin-approvals-page','admin-security-page','admin-system-page',
 'admin-release-page','admin-backup-page','admin-announcements-page','admin-logs-page','admin-settings-page'
]) assert(pages.includes('.admin-shell-v3 .admin-content .'+root),root+' styles must be scoped inside admin shell');
if(process.exitCode)process.exit(process.exitCode);
console.log('Admin style contracts passed: isolated selectors, session-bound role verification, and current admin branding.');
