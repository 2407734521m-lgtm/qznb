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
function assert(ok,message){if(!ok){console.error(`Admin style contract failed: ${message}`);process.exitCode=1;}}
assert(main.includes("supabase.rpc('my_role')"),'dedicated host must verify the role before mounting admin');
assert(main.includes("<Admin verifiedRole={role === 'super_admin' ? 'super_admin' : 'admin'} />"),'verified role must be passed to the admin page');
assert(!main.includes('我们的班级'),'admin title fallback must use current brand');
assert(admin.includes('className="admin-shell-v3"'),'admin page must use one isolated root class');
assert(!admin.includes("supabase.rpc('my_role')"),'admin page must not repeat the host role query');
assert(admin.includes("import '../styles-admin-tokens.css';"),'admin tokens must load after compatibility styles');
assert(workspace.includes('<strong>堯</strong>')&&!workspace.includes('青春档案'),'admin workspace must use current brand');
for(const [name,css] of [['cinematic',cinematic],['unified',unified],['scaffold',scaffold],['ops',ops]]){
 assert(!/\.admin-shell(?!-v3)\b/.test(css),`${name} CSS must use isolated admin root`);
}
const leaks=[/^\s*\.admin-content(?=\s|[>:#,.])/m,/^\s*\.admin-header(?=\s|[>:#,.])/m,/^\s*\.admin-search(?=\s|[>:#,.])/m,/^\s*\.admin-loading-pulse(?=\s|[>:#,.])/m];
for(const [name,css] of [['cinematic',cinematic],['unified',unified]])assert(!leaks.some(p=>p.test(css)),`${name} legacy selectors must stay under admin root`);
assert(tokens.includes('--admin-bg-0: #f7f9fc;')&&tokens.includes('.admin-shell-v3 .admin-sidebar'),'admin tokens must define isolated light shell');
if(process.exitCode)process.exit(process.exitCode);
console.log('Admin style contracts passed: isolated root, single role check, and current admin branding.');
