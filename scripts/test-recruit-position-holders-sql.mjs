import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
// 任职人改为数据库字段迁移的离线测试：不连生产库、不需要真实账号。
// 夹具只 stub 认证相关的最小依赖：my_role() 用会话变量控制角色，
// auth.uid() 返回固定 uuid；email_delivery_logs 只给 140000 迁移改约束用。
const root = new URL('../', import.meta.url);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000000'::uuid $$;
create function public.my_role() returns text language sql as $$ select coalesce(current_setting('app.test_role', true), '') $$;
create table public.email_delivery_logs(id bigint generated always as identity primary key, category text, source text);`);
for (const path of [
  'supabase/migrations/20261128140000_recruit_ruishi.sql',
  'supabase/migrations/20261128170000_recruit_polish_batch1.sql',
  'supabase/migrations/20261128200000_recruit_position_holders.sql',
]) {
  await db.exec(readFileSync(new URL(path, root), 'utf8'));
  console.log('PASS load ' + path);
}

let passed = 0;
function check(name, cond) {
  if (!cond) throw new Error('FAIL ' + name);
  passed += 1;
  console.log('PASS ' + name);
}
async function expectError(name, sql, needle) {
  try {
    await db.query(sql);
  } catch (e) {
    check(name, String(e.message).includes(needle));
    return;
  }
  throw new Error('FAIL ' + name + ' (expected error ' + needle + ')');
}
async function setRole(role) {
  await db.query(`select set_config('app.test_role', '${role}', false)`);
}
const one = async (sql) => (await db.query(sql)).rows[0];
const posId = async (title) =>
  (await db.query(`select id from public.recruit_positions where title = '${title}'`)).rows[0].id;

const dongId = await posId('董事长');
const baoanId = await posId('保安');
const kuaijiId = await posId('会计');

// 1. seed：5 个满员职位带上任职人，其余为空数组。
check(
  'seeded holders for filled positions',
  JSON.stringify((await one(`select holder_names from public.recruit_positions where id = ${dongId}`)).holder_names) === JSON.stringify(['王瑞']) &&
  JSON.stringify((await one(`select holder_names from public.recruit_positions where id = ${baoanId}`)).holder_names) === JSON.stringify(['李柯', '严浩溢']) &&
  JSON.stringify((await one(`select holder_names from public.recruit_positions where title = '财务总监'`)).holder_names) === JSON.stringify(['陈泽洋']),
);
check(
  'open positions have empty holders',
  JSON.stringify((await one(`select holder_names from public.recruit_positions where id = ${kuaijiId}`)).holder_names) === JSON.stringify([]),
);

// 2–3. 任职人占满的职位：提交直接拒绝（董事长 1/1、保安 2/2）。
await expectError('submit to 董事长 rejected as full', `select public.submit_recruit_application(${dongId}, '张三', '123456@qq.com')`, 'position full');
await expectError('submit to 保安 rejected as full', `select public.submit_recruit_application(${baoanId}, '李四', '234567@qq.com')`, 'position full');

// 4. 会计（名额 2、无任职人）：提交成功。
const appId = (await db.query(
  `select public.submit_recruit_application(${kuaijiId}, '王五', '345678@qq.com') as id`,
)).rows[0].id;
check('submit to 会计 returns id', Number(appId) > 0);

// 5. 非超管改任职人被拒绝；超管把会计的任职人设为张三（去重去空也顺带验）。
await expectError('upsert forbidden for non-admin', `select public.admin_upsert_recruit_position(null, '测试岗', '综合', 1, null, null, '', '', true, 0, array['张三'])`, 'forbidden');
await setRole('super_admin');
const kuaijiAfter = await one(
  `select public.admin_upsert_recruit_position(${kuaijiId}, '会计', '财务', 2, 5000, 8000, '', '', true, 50, array['张三', '张三', '  ']) as id`,
);
check('upsert returns same id', Number(kuaijiAfter.id) === Number(kuaijiId));
check(
  'holders normalized (dedup, trim, drop empty)',
  JSON.stringify((await one(`select holder_names from public.recruit_positions where id = ${kuaijiId}`)).holder_names) === JSON.stringify(['张三']),
);

// 6. 会计现在已占 1（任职人张三）+ 通过 0，名额 2：还能再投一份。
const appId2 = (await db.query(
  `select public.submit_recruit_application(${kuaijiId}, '赵六', '456789@qq.com') as id`,
)).rows[0].id;
check('second submit to 会计 ok while one slot left', Number(appId2) > 0);

// 7. 通过第一份申请：已占变成 2（通过 1 + 任职 1），再投就满了。
const reviewed = await one(`select * from public.admin_review_recruit_application(${appId}, 'approved', '')`);
check('approve first 会计 application', reviewed.status === 'approved');
await expectError('submit to 会计 rejected once full via holders+approved', `select public.submit_recruit_application(${kuaijiId}, '孙七', '567890@qq.com')`, 'position full');

// 8. 满员职位上已有的待审申请：单个通过与批量通过都被拦住；
//    同一批里其他职位的待审照常通过。
const pendingOnFull = (await db.query(
  `insert into public.recruit_applications(position_id, name, qq_email, status) values (${dongId}, '周八', '678901@qq.com', 'pending') returning id`,
)).rows[0].id;
await expectError('approve on full 董事长 rejected', `select * from public.admin_review_recruit_application(${pendingOnFull}, 'approved', '')`, 'position full');
const frontendId = await posId('前端工程师');
const pendingFrontend = (await db.query(
  `insert into public.recruit_applications(position_id, name, qq_email, status) values (${frontendId}, '吴九', '789012@qq.com', 'pending') returning id`,
)).rows[0].id;
const batch = await one(
  `select public.admin_review_recruit_applications_batch(array[${pendingOnFull}, ${pendingFrontend}]::bigint[], 'approved', '') as r`,
);
check(
  'batch skips full position, approves the other',
  batch.r.processed === 1 && batch.r.skipped === 1 && batch.r.stopped_full === true &&
  batch.r.results[0].result === 'full' && batch.r.results[1].result === 'done',
);
check(
  'frontend application approved by batch',
  (await one(`select status from public.recruit_applications where id = ${pendingFrontend}`)).status === 'approved',
);

// 9. 后台列表返回任职人；统计里开放职位数不再把占满的算进去。
//    此时已满：董事长/总经理/人事经理/财务总监/保安（任职人占满）、
//    会计（通过 1 + 任职 1 = 名额 2）、前端工程师（通过 1 = 名额 1），
//    开放只剩技术总监、后端工程师、运营专员、保洁员 4 个。
const adminList = await db.query(`select * from public.admin_list_recruit_positions()`);
const dongRow = adminList.rows.find((r) => r.title === '董事长');
check('admin list returns holder_names', JSON.stringify(dongRow.holder_names) === JSON.stringify(['王瑞']));
const kuaijiRow = adminList.rows.find((r) => r.title === '会计');
check('admin list 会计 has holder and approved counts', kuaijiRow.approved_count === 1n || kuaijiRow.approved_count === 1);
const stats = await one(`select public.admin_recruit_stats() as s`);
check(
  'stats open_positions excludes filled ones',
  stats.s.total_positions === 11 && stats.s.open_positions === 4,
);

// 10. 任职人校验：单人超 20 字、超过 100 人都被拒绝。
await expectError(
  'holder name over 20 chars rejected',
  `select public.admin_upsert_recruit_position(${kuaijiId}, '会计', '财务', 2, null, null, '', '', true, 50, array[repeat('王', 21)])`,
  'bad holders',
);
await expectError(
  'more than 100 holders rejected',
  `select public.admin_upsert_recruit_position(${kuaijiId}, '会计', '财务', 2, null, null, '', '', true, 50, (select array_agg('人' || g) from generate_series(1, 101) g))`,
  'bad holders',
);

// 11. 旧的十参调用仍能跑（新增参数有默认值），任职人默认空数组。
const newPosId = (await db.query(
  `select public.admin_upsert_recruit_position(null, '测试岗', '综合', 1, null, null, '', '', true, 0) as id`,
)).rows[0].id;
check(
  'ten-arg upsert still works, holders default empty',
  Number(newPosId) > 0 &&
  JSON.stringify((await one(`select holder_names from public.recruit_positions where id = ${newPosId}`)).holder_names) === JSON.stringify([]),
);

// 12. 驳回不受名额影响：满员职位上的待审申请可以驳回。
const rejected = await one(`select * from public.admin_review_recruit_application(${pendingOnFull}, 'rejected', '名额已满')`);
check('reject on full position works', rejected.status === 'rejected');

console.log(`OK ${passed} assertions`);
await db.close();
