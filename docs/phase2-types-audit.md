# 第二阶段审计报告：TypeScript 类型系统接入评估

日期：2026-10-31
范围：**只读审计**。所有实验均在本地克隆中进行并已还原；未修改 main、未执行生产 SQL、未部署。
基线：main = `1065f4dc`（PR #84 合并提交），本地 `npm ci → tsc --noEmit → build` 全过。

---

## 1. 第一阶段合并与部署状态（已核实）

- PR #84 已合并，merge commit `1065f4dca4a406fbb64c43ed856539dc16d5b2e4` 即当前 main HEAD。
- 该提交的 Deploy 工作流运行 **success**，站点 https://qianzhi.pw 返回 200。第一阶段成果（lockfile、npm ci、Dependabot、类型文件）已生效。
- 附带发现：**Dependabot 已开始工作**（github-actions 类更新运行已 success，npm 类在进行中）。治理提醒：Dependabot 之后会自动开依赖更新 PR，**必须走与人工 PR 相同的审查门禁**，尤其大版本（React 19 / Vite 8 等）不得顺手合并，留待专项评估。

## 2. Supabase 客户端盘点

- **全仓只有一个客户端实例**：`src/lib/supabase.ts` 导出的单例 `supabase`，被 **41 个文件**引用；没有任何第二处 `createClient`。这是接入泛型的理想前提——改造点收敛在一个文件。
- `supabase.ts` 现状：按域名决定同源 `/api` 或环境变量 URL；`(window as any).__SUPABASE_URL` 是该文件内唯一的 `as any`（接入阶段可给 `window` 补一个声明消除）；客户端**未带 `<Database>` 泛型**。
- 遗留旧问题（非本阶段范围，仅记录）：`src/pages/Admin.tsx:1036` 健康检查里仍有硬编码的 publishable key 字面量（第一阶段已核实不是 Project B 的 key，探针可能假阳性），建议在 Admin 拆分时顺手清理。

## 3. database.types.ts 结构与兼容性

- 结构为官方格式（Tables / Views / Functions / Enums + TablesInsert 等辅助类型），1724 行，独立通过 tsc；**当前全仓零引用**（没有任何文件 import 它），接入工作尚未开始。
- 与 supabase-js 2.118 的兼容性：已由 §7 的本地实验实证——接入后报出的全部是普通类型不匹配错误，没有出现类型结构被客户端拒绝的情况，经典形状可用。
- **兼容性缺口一（生成口径，重要）**：14 张表的主键是 `GENERATED ... AS IDENTITY`（album_photos、albums、backup_logs、board_messages、comments、events、greetings、hot_snippets、notifications、posts、reports、time_capsules、timelines、wishes）。这类列在 `information_schema` 里 `column_default` 为空，第一阶段导出生成时据此把 Insert 的 `id` 误标为**必填**（真实情况应为可选）。其余 7 张用 `nextval` 默认值的表无此问题。这是 §7 中 16 个错误的统一根因，修法明确：生成口径补 `is_identity` 判断后再生，或改用官方 CLI 再生（`npm run types:gen`，带 Project B 守卫）。
- **兼容性缺口二（信息缺失）**：91 个 RPC 函数的 `Returns` 全部是 `unknown`（导出时未解析函数返回结构）。`rpc()` 的结果只要被当作具体数据读取就会报错（§7 中 Admin 在线数 `online_count`/`active_count` 即此例）。受影响面有限——60 处 `.rpc(` 调用中多数是写操作或经 `any` 兜底，真正读取结构化结果的高频函数可枚举：`admin_presence_summary`、`public_guest_landing`、`member_directory`、`member_detail`、`my_role` 等，需要为其补精确返回类型（可从函数定义/迁移文件逐个核对，属于"补类型"而非改逻辑）。

## 4. 重复类型定义全量清单

同名类型定义共 5 组。**关键结论：它们大多不是同一类型的等同副本，而是各文件按自己查询列写的"投影子集"，且存在两处同名异实体**——统一时不能无脑删重，必须逐个对齐到生成类型（全集用 `Tables<'...'>`，子集用 `Pick` 投影）。

**Profile ×6**（均为 profiles 的子集；生成真值：`username: string` 非空）

| 位置 | 字段 |
|---|---|
| `src/components/AdminLoveWall.tsx:14` | id、username、display_name、real_name |
| `src/components/AdminNotificationCenter.tsx:14` | id、username(string \| null)、display_name、real_name |
| `src/pages/Board.tsx:8` | id、username(string)、display_name、avatar_path |
| `src/pages/Feed.tsx:9` | 同 Board（逐字相同） |
| `src/pages/SongWall.tsx:7` | id、display_name、username(string \| null) |
| `src/types/message.ts:1` | id、display_name、username、avatar_path |

不一致点：`username` 的可空性有两种口径（`string` vs `string | null`），以数据库为准应是 `string`；写成 `| null` 的两处是放宽，不会出错但会误导后续判断。

**Post ×3 —— 含一处同名异实体**

| 位置 | 实际实体 | 字段要点 |
|---|---|---|
| `src/components/AdminLoveWall.tsx:4` | **表白墙投稿**（不是动态） | recipient_name、category、is_anonymous、status 等 8 字段 |
| `src/pages/Admin.tsx:24` | 动态 posts | 含 deleted_at |
| `src/pages/Feed.tsx:8` | 动态 posts | 无 deleted_at（查询没选该列） |

统一时 AdminLoveWall 的应改名为 `LoveWallPost` 并对齐 `love_wall_posts` 表类型，避免与 posts 混淆。

**Song ×2**：`src/pages/SongWall.tsx:6` 比 `src/components/AdminSongWall.tsx:5` 多 `duration_seconds`（子集差异）。
**Cmt ×2**：`src/pages/Admin.tsx:25` 比 `src/pages/Feed.tsx:10` 多 `deleted_at`（子集差异）。
**M ×2 —— 另一处同名异实体**：`src/pages/Chat.tsx:8` 是聊天消息，`src/pages/Members.tsx:10` 是成员，两者毫无关系，只是都用了随手写的短名 `M`，统一时应分别改名为 `ChatMessage` / `MemberListItem` 之类。

另：`src/types/` 目前只有 `message.ts` 一个文件，是天然的类型归口位置——统一后的共享投影类型应放这里。

## 5. any 与类型绕过普查

分类统计（正则普查，`catch (e: any)` 20 处已含在": any 注解"内，不重复计入总量）：

| 类别 | 数量 | 说明 |
|---|---|---|
| `: any` 注解 | 63 | 含 catch 参数 20 处 |
| `as any` | 47 | AdminMemberModal 一文件占 16 |
| `any[]` / `Array<any>` | 31 | |
| `<any>` 泛型参数 | 10 | |
| `as unknown as` 双重断言 | **1** | `src/pages/MyProfile.tsx`，唯一的双重绕过 |
| 其他 `as` 断言 | 44 | 多为 DOM/事件等常规断言，需逐个看 |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** | 纪律不错，没有整文件关检查 |

按文件（any 相关合计前列）：Admin.tsx ≈48、AdminMemberModal.tsx ≈17、Login.tsx ≈18、Home.tsx ≈12、retry.ts ≈9、App.tsx ≈8、Feed.tsx ≈7、MyProfile.tsx ≈7。

数据面：`.from(` 调用 185 处、`.rpc(` 调用 60 处——这就是类型接入后被覆盖的查询面。

## 6. 大型文件与模块依赖

体量前列（行）：Admin.tsx 1520、App.tsx 783、Login.tsx 465、MyProfile.tsx 461、Capsule.tsx 361、Chat.tsx 274、Home.tsx 266、AdminLoveWall.tsx 242、Member.tsx 229。

- **App.tsx 是路由中枢**：直接 import 42 个模块（全部页面 + 若干组件）；内部组件与拆分接缝见第一阶段文档 §4（Shell 约 515 行为最大块）。
- **Admin.tsx 有两个入口**：`src/main.tsx`（admin 子域名 AdminShell）和 `src/App.tsx`（AdminRoute 跳转）都引用它；它自身 import 7 个后台组件 + 2 个 CSS 文件。拆分 Admin 时要同时顾及两个入口，回归必须覆盖两个地址。
- 类型迁移与拆分的耦合：Admin.tsx 同时是 any 最多（≈48）和体积最大的文件。建议顺序是**先拆分、后清 any**（小文件里改类型更安全、冲突面小），或至少把两者交错分 PR，不要在同一个 PR 里既搬家又改类型。

## 7. 接入 Database 泛型：本地实验结果（已还原）

方法：本地克隆中给 `supabase.ts` 加一行 `createClient<Database>(...)` + 类型 import，跑 `tsc --noEmit`，统计后 `git checkout` 还原，基线复验通过。

**结果：共 57 个错误，分布在 15 个文件。**

- 按文件：Admin.tsx 14、AdminMemberModal.tsx 6、App.tsx 6、MyProfile.tsx 5、Member.tsx 5、Timeline.tsx 4、Feed.tsx 4、Greetings.tsx 3、AlbumDetail.tsx 2、GamePicker.tsx 2、Album/Board/Capsule/Wishes/MeGreetings 各 1。
- 按错误码：TS2345（实参不匹配）25、TS2339（属性不存在）16、TS2322（赋值不匹配）10、TS7053（索引隐式 any）6。
- **三类根因**：
  1. **生成器 identity 口径（16 个）**：即 §3 缺口一，全部表现为 insert 时"Property 'id' is missing"。修生成口径后自动消失，不涉及业务代码。
  2. **RPC 返回未类型化（若干）**：如 Admin 总览读 `admin_presence_summary` 的 `online_count`/`active_count` 报属性不存在。修法是给被消费的 RPC 补 Returns 类型（§3 缺口二）。
  3. **真实的可空性/形状不一致（其余）**：如 AdminMemberModal 把数据库可空字段（`string | null`）赋给本地非空表单类型（6 连报）、个别页面读了所查表中不存在的字段名等。这类是接入类型系统真正要暴露和修正的存量问题，数量不大、定位明确。
- **结论：接入可行、规模可控**。57 个里约 1/3 是生成侧一次性修复，真实代码侧约 40 个且高度集中（Admin 相关 20 个）。业务风险主要在"为了过类型检查而顺手改逻辑"的诱惑——迁移纪律必须是：只改类型标注与空值处理，不改运行时行为；凡发现字段名对不上（根因 3 中的读错字段），单独记录、单独确认，不在类型 PR 里顺手"修功能"。

## 8. 分模块迁移计划（每步独立 PR，均不合并待审）

**步骤 0（先决，只动类型与生成脚本）**：修正生成口径——给导出生成补 `is_identity` 判断并再生 `database.types.ts`（或在可 link 的环境用 `npm run types:gen` 官方再生）；同时为 §3 列出的高频 RPC 手工补 Returns 类型（新建小文件或在类型文件中以注释标明人工维护段）。验收：文件独立 tsc 通过；用 §7 同款实验复测，错误应从 57 降至约 40 且"id is missing"归零。风险：低（文件仍未被引用）。

**步骤 1（lib 层收口）**：清理 `src/lib/retry.ts`（≈9 处）与 `supabase.ts` 的 `(window as any)`（补 Window 接口声明）。验收：typecheck/build；回归：全站冒烟（lib 是公共层）。

**步骤 2（重复类型统一，不接泛型）**：逐文件把 §4 的本地类型换成生成类型/`Pick` 投影，放 `src/types/` 归口；同名异实体改名（LoveWallPost、ChatMessage、MemberListItem）。顺序从叶子页面开始（Board/Feed/SongWall/AdminLoveWall/AdminNotificationCenter/message.ts），每文件一小 PR 或按 2–3 文件打包。验收：每步 typecheck/build（未接泛型时结构应等价，若某处不等价报错，说明该处本地类型与库结构本就对不上，停下单独报告）；回归：对应页面真机抽查（动态流、表白墙、歌声墙、公告、通知中心）。

**步骤 3（接入泛型 + 清剩余错误）**：`createClient<Database>` 一行接入，逐批修 §7 根因 2/3：先叶子页（Album/Board/Capsule/Wishes/Greetings/MeGreetings/Timeline/Feed/GamePicker），再 MyProfile/Member，然后 App，最后 Admin + AdminMemberModal（结合步骤 4 的拆分节奏）。验收：每批 typecheck 归零对应文件、build 过；回归清单见 §9。

**步骤 4（大文件拆分，与步骤 3 后半交错）**：按第一阶段 §4 方案：Admin 先拆 charts 与页签（每次 2–3 个），App 拆 screens 与 Shell。拆分 PR 只搬家不改类型/逻辑。验收：build + 两个后台入口 + 主要页面真机抽查。

**步骤 5（any 清零收尾）**：按文件清零剩余 any（Admin 剩余、Login 18、Home 12 等），catch 参数统一为 `unknown` + 守卫收窄。验收：普查脚本复跑，any 相关计数归零或仅剩书面豁免项（逐项列明理由）。

## 9. 每步通用回归要求

- 机器门禁：`npm ci → npm run typecheck → npm run build` 全过（verify-pr 已自动执行）。
- 真机抽查（按当步涉及面增减）：登录/注册验证码流程、成员墙与成员详情、私聊收发、相册上传与浏览、个人资料保存、表白墙投稿与展示、后台总览（在线数卡）、成员管理弹窗、公告发布、维护模式开关页。
- 纪律：类型 PR 只改类型与空值处理；发现疑似功能 bug（读错字段、空值未处理）单独开条目报告，不顺手改。

## 10. 风险汇总

| 风险 | 等级 | 对策 |
|---|---|---|
| 未修生成口径就接入泛型，会把 16 个假错误当真问题改业务代码 | 中 | 步骤 0 先行，且作为全盘前提 |
| RPC Returns 缺失导致个别页面改法走样（如强转 as any 糊过去） | 中 | 步骤 0 补齐被消费 RPC 的返回类型；审查时禁止新增 as any |
| Admin 文件 any 与拆分交织引发冲突 | 中 | 先拆后清、分 PR、每 PR 小步 |
| 迁移中顺手改逻辑引入功能回归 | 中 | §9 纪律 + 真机抽查清单 |
| Dependabot 大版本 PR 被误合 | 低 | 与人工 PR 同门禁，专项评估 |

**审计结论**：类型接入的总工作量已探明（57 个错误、约 40 个真实项、集中在 Admin 生态），路径清晰、风险可控。建议按步骤 0 → 1 → 2 → 3 → 4/5 推进，每步等确认后再开始下一步。
