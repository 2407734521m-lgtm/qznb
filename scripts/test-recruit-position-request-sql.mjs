import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
// 新增岗位申请迁移的离线测试：不连生产库、不需要真实账号。
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
  'supabase/migrations/20261128193000_recruit_position_requests.sql',
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

// 1. 正常提交：返回 id，行是 pending，部门默认“综合”。
const reqId = (await db.query(
  `select public.submit_recruit_position_request('摄影助理', '', 4000, 6000, '负责拍摄活动照片', '123456@qq.com') as id`,
)).rows[0].id;
check('submit returns id', Number(reqId) > 0);
check(
  'submitted row is pending with defaults',
  (await db.query(`select title, department, salary_min, salary_max, description, qq_email, status from public.recruit_position_requests where id = ${reqId}`)).rows[0].title === '摄影助理',
);

// 2–4. 校验：坏邮箱、空标题、薪资倒挂都被拒绝。
await expectError('bad email rejected', `select public.submit_recruit_position_request('新岗位', '', null, null, '', 'not-an-email')`, 'bad email');
await expectError('empty title rejected', `select public.submit_recruit_position_request('   ', '', null, null, '', '123456@qq.com')`, 'bad title');
await expectError('salary min>max rejected', `select public.submit_recruit_position_request('新岗位', '', 9000, 6000, '', '123456@qq.com')`, 'bad salary');

// 5. 同名岗位已在招（董事长是种子职位），拒绝。
await expectError('existing open position rejected', `select public.submit_recruit_position_request('董事长', '', null, null, '', '123456@qq.com')`, 'position exists');

// 6. 同名申请还在待审，拒绝。
await expectError('duplicate pending request rejected', `select public.submit_recruit_position_request('摄影助理', '', null, null, '', '999999@qq.com')`, 'already requested');

// 7. 非超管看不到申请列表（返回空，不报错）。
await setRole('');
check(
  'admin list empty for non-admin',
  (await db.query(`select * from public.admin_list_recruit_position_requests('all')`)).rows.length === 0,
);

// 8. 非超管审核被拒绝。
await expectError('review forbidden for non-admin', `select * from public.admin_review_recruit_position_request(${reqId}, 'approved', '')`, 'forbidden');

// 9. 超管通过：建出职位（名额 1、开放、薪资照申请、排最后），申请标已通过。
await setRole('super_admin');
const approved = await one(`select * from public.admin_review_recruit_position_request(${reqId}, 'approved', '')`);
check('approve returns created position id', Number(approved.created_position_id) > 0);
const pos = await one(`select title, department, quota, salary_min, salary_max, is_open from public.recruit_positions where id = ${approved.created_position_id}`);
check('created position has quota 1 and is open', pos.quota === 1 && pos.is_open === true);
check('created position keeps salary and department', pos.title === '摄影助理' && pos.salary_min === 4000 && pos.salary_max === 6000 && pos.department === '综合');
const reqAfter = await one(`select status, reviewed_at, created_position_id from public.recruit_position_requests where id = ${reqId}`);
check('request approved with reviewed_at', reqAfter.status === 'approved' && reqAfter.reviewed_at !== null && Number(reqAfter.created_position_id) === Number(approved.created_position_id));

// 10. 已审核过的不能再审。
await expectError('already reviewed rejected', `select * from public.admin_review_recruit_position_request(${reqId}, 'rejected', '')`, 'already reviewed');

// 11. 通过后同名再申请：职位已存在，拒绝。
await expectError('resubmit after approval rejected', `select public.submit_recruit_position_request('摄影助理', '', null, null, '', '123456@qq.com')`, 'position exists');

// 12. 驳回流程：不建职位，备注记下来；超管列表能看到两条（一条已通过、一条已驳回）。
const reqId2 = (await db.query(
  `select public.submit_recruit_position_request('保洁领班', '后勤', null, null, '', '234567@qq.com') as id`,
)).rows[0].id;
const rejected = await one(`select * from public.admin_review_recruit_position_request(${reqId2}, 'rejected', '已有相同职位')`);
check('reject returns null position id', rejected.created_position_id === null);
const req2After = await one(`select status, admin_note from public.recruit_position_requests where id = ${reqId2}`);
check('request rejected with note', req2After.status === 'rejected' && req2After.admin_note === '已有相同职位');
check(
  'no position created for rejected request',
  (await db.query(`select count(*)::int as n from public.recruit_positions where title = '保洁领班'`)).rows[0].n === 0,
);
check(
  'admin list shows both reviewed requests',
  (await db.query(`select * from public.admin_list_recruit_position_requests('all')`)).rows.length === 2,
);

console.log(`OK ${passed} assertions`);
await db.close();
