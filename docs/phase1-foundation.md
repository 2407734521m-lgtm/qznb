# 第一阶段：基础架构升级 — 审计与实施记录

日期：2026-10-31
分支：`chore/phase1-foundation`（基于 main `bfdbcb3`）
原则：逐步升级、不推倒重写；不改业务代码行为；不动生产数据库；不合并、不部署（等审核）。

---

## 1. 本阶段实际改动

| 文件 | 改动 | 原因 |
|---|---|---|
| `package-lock.json` | 新增（由 `npm install` 按现有 `package.json` 范围生成） | 锁定依赖解析结果，使本地、CI、部署三处装出同一棵依赖树；`npm ci` 的前提 |
| `.github/workflows/deploy.yml` | `npm install` → `npm ci`；setup-node 增加 `cache: 'npm'` | 部署构建可复现；缓存加速 |
| `.github/workflows/verify-pr.yml` | 同上 | PR 检查与部署使用同一安装方式 |
| `package.json` | 新增脚本 `types:gen`（指向 `scripts/gen-types.sh`） | Database Types 再生入口，带 Project B 项目保护（见 §3 末小节） |
| `scripts/gen-types.sh` | 新增 | 生成前的守卫脚本：校验当前关联项目必须是 Project B，不符立即终止，绝不生成 Project A 的类型（逻辑已在本地三种情形下实测） |
| `src/lib/database.types.ts` | 新增（1724 行） | 由 Project B 生产库 `public` 结构实时导出生成：35 张表（Row/Insert/Update + 外键 Relationships）、91 个 RPC 函数名与参数、标准辅助类型。**本阶段仅落地文件，尚未把 `createClient<Database>` 接入 `src/lib/supabase.ts`**（见 §3 路线） |
| `.github/dependabot.yml` | 新增 | npm 与 GitHub Actions 依赖每周自动检查、开 PR 提醒（替代人工跑 `npm audit`） |
| `docs/phase1-foundation.md` | 新增（本文件） | 审计结论与后续阶段方案 |

**未改动**：任何业务源码（`src/**` 除新增类型文件外零修改）、任何 SQL/迁移、任何密钥与环境变量、`migrate.yml`（psql 手动触发型，无 npm 步骤，不需要改）。

## 2. 依赖管理审计

- 直接依赖 6 个、开发依赖 5 个，依赖树小而干净。
- 本次锁定版本：react 18.3.1、react-router-dom 6.30.6、framer-motion 11.18.2、@supabase/supabase-js 2.x（按 `^2.118.0` 解析）、vite 5.4.21、typescript 5.9.3 —— 均为现有声明范围内的最新版，与此前 `npm install` 浮动安装的结果一致，**没有借机升级任何版本**。
- `npm outdated` 显示有大版本可升（React 19、Vite 8、TS 7、framer-motion 14 等）：全部属于高风险跨代升级，**本阶段不做**，留待专项阶段逐项评估。
- `npm audit`：执行环境（沙箱出口策略）拦截了 npm 官方审计端点，本阶段未能取得官方漏洞计数；已用 Dependabot 作为常态化替代（合并本 PR 后生效）。建议在 GitHub 仓库 Settings 里顺手开启 Dependabot alerts（仓库级开关，不在代码范围内）。
- 仓库根目录另有 `github-workflow-deploy.yml` 一份游离文件（不生效的工作流副本），建议后续阶段删除以免误导，本阶段未动。

## 3. TypeScript 类型系统盘点

现状：`tsconfig.json` 已开 `strict: true`，`npm run typecheck`（`tsc --noEmit`）在当前 main 上**通过**；verify-pr 已把 typecheck 作为合并门禁。

问题清单（本阶段只盘点、不批量修）：

- `any` / `as any` / `any[]` 等共约 **118 处**，分布（前几名）：`src/pages/Admin.tsx` 24、`src/pages/Login.tsx` 9、`src/pages/Home.tsx` 8、`src/components/AdminMemberModal.tsx` 7、`src/lib/retry.ts` 6、`src/pages/Feed.tsx` 5、`src/App.tsx` 5。
- **重复类型定义**（同名类型多处各写一份）：`Profile` 6 处、`Post` 3 处、`Wallpaper`/`Song`/`SocialItem`/`GameProfile` 各 2 处；`src/types/` 目前只有一个 `message.ts`，类型没有统一归口。
- 数据层未类型化：`supabase.ts` 的 `createClient` 未带 `<Database>` 泛型，查询结果靠手写接口和 `any` 兜底，这是上面两类问题的源头。

收敛路线（第二阶段，每步独立 PR、可回滚）：

1. `createClient<Database>` 接入（改动集中在 `supabase.ts` 一行 + 随之暴露的类型错误逐个修，预计主要落在 Admin/Login 两文件）。
2. 各页面手写 `Profile`/`Post` 等改为引用 `Tables<'profiles'>` 等生成类型，删重复定义。
3. 按文件清零 `any`：顺序 retry.ts → Feed/Home → Login → Admin（Admin 结合 §4 拆分一起做）。

### database.types.ts 的来源、项目保护与再生规程

- **来源**：本文件初版于 2026-10-31 由 **Project B** 生产库 `public` 结构的实时导出生成（经 Supabase Management API 读取 `information_schema` / `pg_catalog`：35 张表、221 列、37 个外键、91 个函数；本项目无视图、无枚举类型），按官方 `supabase gen types` 的输出格式组织，生成后已在仓库内通过 `tsc --noEmit` 校验。一个细节：`profiles.username` 是 `citext` 类型，已映射为 `string`。
- **项目 ref（写死在此处以防混淆）**：Project B = `ldypnxxxgscibopgiaso`（class-youth-archive2，新加坡，现生产）。Project A 是另一个旧项目（美西、回滚用途，结构停留在早期版本），**严禁用 A 生成类型**——会把旧结构误当成现状，污染后续所有开发。
- **Supabase CLI 前提（新环境照此复现）**：
  1. 安装 Supabase CLI **v2**：macOS 用 `brew install supabase/tap/supabase`；Windows 用 Scoop 或官方 Releases 的二进制；Linux 下载官方 Releases 的二进制包解压到 PATH。统一用 v2，不要用来源不明的旧版。
  2. 登录：运行 `supabase login` 粘贴 Supabase 账号的 Personal Access Token，或设置环境变量 `SUPABASE_ACCESS_TOKEN`。令牌只留本机，**不要写进仓库任何文件**。
  3. 在仓库根目录关联项目：`supabase link --project-ref ldypnxxxgscibopgiaso`。关联结果记录在本机 `supabase/.temp/project-ref`（该目录不入库）。
- **生成方法**：`npm run types:gen`，实际执行 `scripts/gen-types.sh`。守卫逻辑：先检查 CLI 已安装，再读取 `supabase/.temp/project-ref` 校验关联项目——未关联则终止并提示关联命令；关联的不是 B 则立即终止并打印当前 ref；校验通过后，生成命令仍显式带 `--project-id ldypnxxxgscibopgiaso`，双重锁定 Project B。
- **生成后检查（每次再生必做）**：
  1. `npm run typecheck` 必须通过；
  2. 抽查已知列：`profiles.username: string`、`profiles.theme: Json`，表总数应与后台一致（当前 35）；
  3. `git diff src/lib/database.types.ts` 过一眼：表与列的增减必须与本次数据库变更对得上；若出现整表消失，先停下查原因，不要提交；
  4. 本文件目前只落地、未接入客户端，再生不改变任何线上行为。

## 4. 前端架构分析与拆分方案（本阶段只定方案，不动代码）

### `src/App.tsx`（783 行）

同文件组件：`TABS`（44）、`TestSwitchFab`（83）、`AdminRoute`（123）、`ResetPassword`（144）、`MaintenanceScreen`（183）、`LoginClosedScreen`（219）、`PublicLanding`（231）、`Shell`（266–780，约 515 行）、`App`（781）。

拆分顺序（每步一个 PR，纯文件移动 + 改 import，不改行为与 UI）：

1. 门禁类屏幕（MaintenanceScreen / LoginClosedScreen / PublicLanding / ResetPassword）→ `src/app/screens/`。
2. `AdminRoute`、`TestSwitchFab` → `src/app/`。
3. `Shell` 单独成 `src/app/Shell.tsx`；其内部的 Dock/顶栏如需再拆分，另行评估。

### `src/pages/Admin.tsx`（1520 行）

结构其实已有天然接缝：图表原语 `Spark`/`TrendChart`/`Donut`（62–141）、外壳 `Admin`（142–356），以及 12 个已独立成函数的页签组件（行号：Overview 357、Members 564、Moderate 678、BoardMgr 796、Logs 906、MaintenanceAccessManager 945、Settings 1006、InviteTab 1175、FeedbackTab 1262、GameTab 1338、TestTab 1413、EventTab 1473），`src/components/` 下也已有 AdminBulkEmail 等拆出件。

拆分顺序：

1. 图表原语 → `src/pages/admin/charts.tsx`。
2. 每次一个 PR 搬 2–3 个页签到 `src/pages/admin/<tab>.tsx`，props 接口原样保留。
3. 最后 Admin.tsx 只剩外壳（页签注册、权限判定、消息通道），目标 < 400 行。

风险控制：每次移动后必须 typecheck + build + 真机抽查对应页签；不与功能改动混在同一 PR。

## 5. 后端架构只读审计（未改任何后端与数据库）

- **Edge Functions**：仓库仅 `supabase/functions/admin-bulk-email` 一个。此前已核实：线上未部署（调用返回 404）；代码内有登录校验 + `my_role()` 管理员校验、逐人发送、上限 100；**缺**：调用审计日志、应用级限流、部署与密钥配置（RESEND_API_KEY / EMAIL_FROM）。本阶段不部署、不配置，等单独决策。
- **身份认证与管理员权限**：前端有 AdminRoute 门禁（且主域 `/#/admin` 现会跳转到 admin 子域名），后端以 `my_role()` + RLS 为准，权限不在前端单点。符合“权限必须在后端实施”的既有约定。
- **API 错误处理与日志**：前端有 `src/lib/retry.ts`（带重试封装）；管理操作有 `admin_audit_logs` 记录（已知台账问题：`log_admin_action` 的 actor 列为空、`set_invite_code_active` 不写日志、邀请码明文入日志 detail —— 均为既有台账项，本阶段未动）。
- **RPC 安全性**：沿用既有审计台账（SECURITY DEFINER 函数的 NULL 角色判定按 P1/P2/P3 分批，P1 的 010 迁移文件在仓库但未由本阶段执行；`member_presence` 授权已单独处理）。**本阶段没有执行任何生产 SQL，也没有修改任何函数。**
- **限流**：Supabase Auth 侧限流已有配置；RPC 与 Edge Function 暂无应用级限流，校园社区规模下风险可控，列入第三阶段（增长后）评估。

## 6. 自动化测试现状与路线

- 现状：`verify-pr.yml` 已在每个 PR 上执行 `npm ci`（本次切换）+ `typecheck` + `build` —— 第一阶段要求的“TypeScript 检查、生产构建检查”已闭环并验证（本地干净环境 `npm ci` → typecheck → build 全过）。
- 缺口：没有任何单元/端到端测试框架。
- 第二阶段引入 Vitest（与现有 Vite 同生态），优先覆盖**纯逻辑与权限判定**：登录标识解析、邀请码/维护码规则、资料字段校验、管理员权限判定函数。聊天、相册等涉及真实后端的端到端测试需要专用测试项目与测试账号（历史上已决定暂不建测试号），待环境决策后再排。

## 7. PR #67 / #68 关系（按要求先查、未破坏）

- **#68 叠在 #67 之上**：#68 的 base 是 `feature/realtime-admin-online-presence`（#67 的 head 分支），不是 main；#68 只改 `src/pages/Admin.tsx`，相对其 base 状态 clean。
- **#67 相对当前 main 已是 `dirty`（有冲突）**：其分支基于较早的 main（`2750c9ae`），main 此后已合入 #81/#83 等多批改动。这是本阶段之前就存在的状态，本 PR 未触碰其任何文件（App.tsx、Admin.tsx、`src/lib/sitePresence.ts`、其迁移文件均不在本 PR diff 内）。
- 本 PR 的改动（lockfile、workflow、package.json scripts、新类型文件、docs、dependabot）与 #67/#68 文件零重叠；将来 #67 若复活，需先 rebase 到新 main 再处理其冲突，与本 PR 无先后依赖。
- 提醒：#67 的迁移（realtime presence）按既有决定**不执行**；本阶段亦未执行任何迁移。

## 8. 兼容性与风险

- **功能兼容性**：本 PR 对业务源码零改动（仅新增一个未被引用的类型文件与元信息文件），不存在行为变化；已在干净环境复现 CI 全流程（`npm ci` → `tsc --noEmit` 通过 → `vite build` 成功；仍有既有的单 chunk >500kB 警告，属代码分割议题，列入前端拆分阶段）。
- **lockfile 风险**：锁定的版本即当前声明范围内最新解析结果，与生产此前每次部署 `npm install` 的实际结果一致；改用 `npm ci` 后若 lockfile 与 package.json 不一致，CI 会直接报错（这正是期望的保护行为）。
- **未做真机回归**：因无行为变化，未做真机抽查；合并后第一次部署建议留意部署运行是否绿灯。
- **未覆盖项**（明确留待后续阶段）：依赖大版本升级、any 清零与类型收敛、App/Admin 实际拆分、Vitest 引入、Edge Function 部署与限流、RPC 台账修复、删根目录游离的 workflow 副本。
