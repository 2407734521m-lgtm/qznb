# 第 5 阶段审计报告：独立服务、移动应用与部署链路

- 审计日期：2026-11-21
- 审计基线：`main` HEAD `e895dff`（第 4 阶段 FIX-4 PR #766 已合并；三线写稿前 `git fetch` 确认 origin/main 未再前进）
- 审计方式：只读代码审计 + 生产库只读核对（项目 `ldypnxxxgscibopgiaso`，`class-youth-archive2`；旧项目 `wnddwkdfndrkxivvrxcy` 已 INACTIVE，未用）+ 线上页面/文件 HEAD 比对 + GitHub Actions API 核对。**未登录任何账号、未播放任何歌曲、未下载任何音频或安装包、未发任何测试消息/邮件、未发布任何版本、未替换任何安装包文件、未触发任何部署、未删任何数据。** 密钥文件只核对存在性与引用关系，未读内容。
- 对照：任务书第 5 阶段；`audit-phase1-work/full-inventory-checklist.md` 第 34、35、36 节；第 1 阶段报告的部署链路部分（404 页）；第 4 阶段 A 线已核对应用管理中心本体（本线只复核版本发布链路，不重复计数）。第 37 节灵动岛残留已在第 3 阶段 C 线核对（14 个组件 + `src/lib/island/` + App 约 20 处接线 + 设置入口 + 任务抽屉，仍在线），本阶段不重复计数，仍等用户定夺去留。

## 0. 计数（逐项表共 134 行，数字与三线底稿逐项表对得上）

| 状态 | 数量 |
|---|---|
| PASS | 25 |
| PARTIAL | 58 |
| FAIL | 2 |
| BLOCKED | 40 |
| NOT_IMPLEMENTED | 8 |
| NOT_TESTED | 1 |
| 合计 | 134 |

| 线 | 范围 | 项数 | PASS | PARTIAL | FAIL | BLOCKED | NOT_IMPLEMENTED | NOT_TESTED |
|---|---|---|---|---|---|---|---|---|
| A | 音乐站 music.qianzhi.pw / radio.qianzhi.pw / 下载页 | 59 | 0 | 42 | 0 | 13 | 4 | 0 |
| B | 动态签名 /signature/ | 33 | 24 | 3 | 2 | 1 | 2 | 1 |
| C | 移动应用与部署链路 | 42 | 1 | 13 | 0 | 26 | 2 | 0 |

计数口径：PASS = 代码 + 数据已确认可用；PARTIAL = 功能在但有缺口，或代码与配置已确认接线存在、但行为未经实测；FAIL = 代码层面已证明不可用或有明确错误行为；BLOCKED = 须真实会话/真机/听觉验证；NOT_IMPLEMENTED = 代码确认没有该功能；NOT_TESTED = 代码里无法核对。A 线 PASS 为 0 是如实的——没有任何一项经真实会话验证；B 线 PASS 24 项是签名页纯前端单文件、代码与数据可逐字节核对的缘故。

## 1. 分线结论

### A 线：音乐站（59 项：PARTIAL 42、BLOCKED 13、NOT_IMPLEMENTED 4）

音乐站是 Git 子模块 `music/folia`（上游 folia-major，AGPL-3.0，v0.7.28，子模块 a44758b），本站改动走构建期 overlay、不动上游仓；独立站点 music.qianzhi.pw + Worker qznb-radio；另有 radio.qianzhi.pw（Mineradio 3D 音乐站）与隐藏下载页 radio.qianzhi.pw/download.html。线上抓取 music.qianzhi.pw 可达（2026-11-21 01:29 UTC 新抓取），只见 `Library` / `No content` 空态，本地曲库为空是预期。

来源矩阵（网页端，代码实测）：真实接通的只有**网易云**（`/api/netease`，约 60 模块 allowlist）、**QQ**（`/api/qq` serverless，QQ_SESSION_SECRET 两步部署）、**免费曲库**（Internet Archive + Jamendo 分支）。**酷狗 NOT_IMPLEMENTED**：registry 注册了，但部署 workflow 没有 `VITE_KUGOU_API_BASE`，`getKugouTransportAvailability` 回 `not-configured`，登录列显示为 `off`（不能选）；`kugouTransport.ts:83` 明写网页端完全不可用。酷我、咪咕全仓无代码。bodian / ytm / spotify / qishui / appleMusic / fnmusic 均为仅桌面端（上游 README 明写）。游客态拿不到 fee=8 付费曲 URL、XEAPI 游客态返 404，是上游现实，本站归类 copyright_unavailable、不自动弹登录框。

13 项 BLOCKED 需真实会话验证（搜索、曲目详情、封面、播放/暂停、上下首、调进度、胶囊控制、展开/收起、播放器内歌词、歌词显示、邮箱登录、用户名登录），需网易云 + QQ + 游客三组实测，未猜成可用。电台站（radio.qianzhi.pw）3D 舞台本身未逐项验——用户 2026-11-16 已说「不要这个电台的」，只核对了 Worker 与下载页。

下载页代码级已验证：`download.html:959` 校验 `playable===true && trial!==true`；全部接口走同源 `/api/dl/*` 带 Bearer；`siteGateModal`「先注册，才能使用」；`robots noindex, nofollow`；生产 `log_music_download()`（9 参数）与 `music_download_logs` 的 `mdl_sel_admin` 策略均存在，与仓库迁移一致。

生产漂移：音乐站相关表/函数（`netease_account_links` RLS 开、0 策略——有意设计只走 Worker service key；`music_download_logs`；`log_music_download`）仓库与生产一致，**无漂移**。

### B 线：动态签名（33 项：PASS 24、PARTIAL 3、FAIL 2、BLOCKED 1、NOT_IMPLEMENTED 2、NOT_TESTED 1）

签名页不是 SPA 路由，是 `public/signature/index.html` 单文件（1.8MB、997 行），构建后原样复制到 `dist/signature/`，由 GitHub Pages 在 `qianzhi.pw/signature/` 直接 served；主站唯一入口是发现页卡片（`Explore.tsx:68`）。页内无 Supabase、无登录、无数据库读写，纯前端单文件应用。线上烟雾核对通过（2026-11-21 01:27 UTC 抓取，标题与全部控件均已渲染）。本线无仓库–生产漂移。

功能链基本完整：双名逐笔、双字体、音译、纸屑淡出、比例/背景、WebM 导出，代码层面都通。但 2 个 FAIL 都是代码已能定论的真毛病：**① 轻音乐关掉后铺底音继续响（B16 / S1）；② 固定 6/10 秒导出一定截掉纸屑与淡出（B24 / S2）**。另有 1 项 BLOCKED：用户 2026-11-16 报的「签名页轻音乐听不到声音」，代码链路完整但听觉无法在代码里验证，须真机验。

数据实测（脚本核对）：`TRANSLIT.pinyin` 恰好 303 条，`CN_GLYPH` 文楷/行书各 303 字且字集与拼音表完全一致；快/如/年/团/贵/龘均不在表内；旻在两套字体里都有笔画数据（已修）；韩文 159 个音节值的所有字符都在 nanum 字库内；龘在全文件出现 0 次，走引擎静态兜底显示。PASS 的硬性要求均守住了：白色主题、无 emoji（全文件 0 个）、无原生弹窗/下拉（`alert`/`confirm`/`prompt`/`<select` 均为 0 次）、字体与笔画数据全部本地内联（Amiri 字体为 data URI，唯一 `fetch(` 是 Tegaki 引擎内 `data:` 短路的字体加载器，不发网络请求）。NOT_TESTED 1 项：Vara.js 1.4.1——内联压缩版无版本字符串，1.4.1 仅见于项目记录，代码里无法证实也无法证伪。

### C 线：移动应用与部署链路（42 项：PASS 1、PARTIAL 13、BLOCKED 26、NOT_IMPLEMENTED 2）

PASS 只有 1 项是如实的：26 项需要真机安装/真机更新弹窗才能验证，没有可用的测试手机，按任务要求一律记 BLOCKED，不猜测为可用。FAIL 0 项：没有代码层面已证明完全不可用的功能；最严重的是 S1 音乐下载版三方版本不一致。

三个 App 的版本口径：主站 App（包名 `pw.qianzhi.app`）1.6 / code 7；管理版 App（`pw.qianzhi.admin`）1.1 / code 2；音乐下载 App（包名 `pw.qianzhi.musicdl`）1.1 / code 2。固定下载地址：`https://qianzhi.pw/app/qingchun-dangan.apk`、`https://qianzhi.pw/app/qingchun-dangan-admin.apk`、`https://qianzhi.pw/app/qianzhi-musicdl.apk`。三个 APK 固定地址线上 HEAD 全部 200，md5 与 `your_files/` 成品逐字节一致；线上 `musicdl-version.json` md5 与仓内文件一致。

生产 `site_settings` 现值（实测）：主站 1.6/code 7/不强制、管理版 1.1/code 2/不强制、音乐下载版 **1.2/code 3**/不强制。11 个本线函数在生产库全部存在；5 张发布相关表在生产库零条 RLS 策略，是设计（只能走 SECURITY DEFINER RPC），不是漂移。

部署链路：`deploy.yml` 最近三次运行 `e895dff` / `e11ada5` / `c42dad3` 全部 success；`deploy-music.yml`、`deploy-radio.yml`、`verify-music.yml` 最近一次也全部 success；`public/404.html` 随部署上线（线上 200，第 1 阶段回归 4/4 PASS）——本线唯一 PASS（C39）。主站/管理版/音乐下载 1.1+ 三处均有软件内更新弹框（用户定的更新方式偏好已落实）；但首次安装与 v1.0 用户仍须手动装安装包（C24：v1.0 无软件内更新是已知缺口，v1.0 源码不在仓内，无法逐行核对）。

站内无任何下载入口（C1–C3 均为 PARTIAL）：三个 App 的首次安装只能靠管理员发的链接/二维码；管理版连后台分享卡都没有。

## 2. 生产库只读核对

- 音乐站相关：`netease_account_links` RLS 开、0 策略（有意设计，只走 Worker service key）；`music_download_logs` 与 `log_music_download()`（9 参数）存在，与仓库迁移一致；仓库与生产一致，无漂移。
- 签名页：不写任何表（文件内 `supabase` 出现 0 次）。本线无漂移。
- 应用与部署：11 个本线函数全部存在（`public_app_update`、`public_admin_app_update`、`public_musicdl_app_update`、`admin_publish_app_release`、`admin_publish_admin_app_release`、`admin_publish_musicdl_app_release`、`admin_list_app_releases`、`admin_list_admin_app_releases`、`admin_list_musicdl_app_releases`、`public_app_announcements`、`mark_app_announcement_read`）；发布历史：`app_releases` 最新三行 1.6/7、1.5/6、1.4/5（与设置一致）；`admin_app_releases` 只有 1.0/1 一行（与设置 1.1/2 不一致，见 C S2）；`musicdl_app_releases` 只有 1.2/3 一行（见 C S1）。
- 漂移（C S5）：三个函数 + 一张表在仓库迁移里无定义，只存在于生产库与 `database.types.ts`——第 2–4 阶段漂移模式延续，已由 FIX-5-10 收敛（实测还多出第四个同类函数 `admin_list_musicdl_app_releases`，一并收敛）。

## 3. 逐项状态总表（134 行）

> 本表由脚本从三线底稿的逐项表逐行生成（A1–A59、B1–B33、C1–C42），行数已核对。

| 编号 | 功能 | 状态 | 底稿 |
|---|---|---|---|
| A1 | Playlists 栏目：入口与内容 | PARTIAL | music-station-audit.md |
| A2 | Radio 栏目：电台/私人 FM | PARTIAL | music-station-audit.md |
| A3 | Explore 栏目 | PARTIAL | music-station-audit.md |
| A4 | Albums 专辑浏览 | PARTIAL | music-station-audit.md |
| A5 | Folder 本地文件夹 | PARTIAL | music-station-audit.md |
| A6 | Library 本地曲库 | PARTIAL | music-station-audit.md |
| A7 | Scratchpad 草稿本 | PARTIAL | music-station-audit.md |
| A8 | 搜索歌曲 | BLOCKED | music-station-audit.md |
| A9 | 曲目详情 | BLOCKED | music-station-audit.md |
| A10 | 专辑封面显示 | BLOCKED | music-station-audit.md |
| A11 | 歌词查看入口 | PARTIAL | music-station-audit.md |
| A12 | 播放/暂停 | BLOCKED | music-station-audit.md |
| A13 | 上一首/下一首 | BLOCKED | music-station-audit.md |
| A14 | 调进度（进度条） | BLOCKED | music-station-audit.md |
| A15 | 看队列 | PARTIAL | music-station-audit.md |
| A16 | 操作播放列表（加歌/移出/乱序/移至末尾） | PARTIAL | music-station-audit.md |
| A17 | 歌单管理（创建/编辑/删除歌单） | PARTIAL | music-station-audit.md |
| A18 | 来源：网易云 | PARTIAL | music-station-audit.md |
| A19 | 来源：QQ 音乐 | PARTIAL | music-station-audit.md |
| A20 | 来源：酷狗 | NOT_IMPLEMENTED | music-station-audit.md |
| A21 | 来源：酷我 | NOT_IMPLEMENTED | music-station-audit.md |
| A22 | 来源：咪咕 | NOT_IMPLEMENTED | music-station-audit.md |
| A23 | 来源：Internet Archive（免费曲库） | PARTIAL | music-station-audit.md |
| A24 | 来源：Jamendo（免费曲库第二来源） | PARTIAL | music-station-audit.md |
| A25 | 来源：其他已注册平台（bodian/ytm/spotify/qishui/appleMusic/fnmusic） | NOT_IMPLEMENTED | music-station-audit.md |
| A26 | 游客态播放（不登录可播） | BLOCKED | music-station-audit.md |
| A27 | 游客/VIP 限制：拿不到 fee=8 付费曲完整地址 | PARTIAL | music-station-audit.md |
| A28 | 区域版权限制界面说明 | PARTIAL | music-station-audit.md |
| A29 | XEAPI 游客态（匿名 warmup） | PARTIAL | music-station-audit.md |
| A30 | 播放器胶囊：播放/暂停、上下首、进度 | BLOCKED | music-station-audit.md |
| A31 | 播放器：展开/收起全屏 | BLOCKED | music-station-audit.md |
| A32 | 播放器：上滑展开/下滑收起 | PARTIAL | music-station-audit.md |
| A33 | 播放器：左右滑切歌 | PARTIAL | music-station-audit.md |
| A34 | 播放器内歌词显示 | BLOCKED | music-station-audit.md |
| A35 | 播放器：封面、切换背景、自定义外观 | PARTIAL | music-station-audit.md |
| A36 | 歌词：显示 | BLOCKED | music-station-audit.md |
| A37 | 歌词：进度同步（跟随滚动） | PARTIAL | music-station-audit.md |
| A38 | 歌词：显示效果（逐字/样式） | PARTIAL | music-station-audit.md |
| A39 | 歌词：样式切换 | PARTIAL | music-station-audit.md |
| A40 | 歌词：背景 | PARTIAL | music-station-audit.md |
| A41 | 歌词/播放器：跟随封面换背景 | PARTIAL | music-station-audit.md |
| A42 | 账号：邮箱登录（音乐站） | BLOCKED | music-station-audit.md |
| A43 | 账号：用户名登录（音乐站） | BLOCKED | music-station-audit.md |
| A44 | 账号：退出音乐站账号 | PARTIAL | music-station-audit.md |
| A45 | 账号：与主站同一用户体系、但需在音乐站单独登录 | PARTIAL | music-station-audit.md |
| A46 | 账号：跨设备同步（网易云凭证 AES-GCM 加密绑本站账号） | PARTIAL | music-station-audit.md |
| A47 | 主站接线：发现页音乐入口 | PARTIAL | music-station-audit.md |
| A48 | 主站接线：全局 MusicIsland | PARTIAL | music-station-audit.md |
| A49 | 主站接线：队尾宽限收回 | PARTIAL | music-station-audit.md |
| A50 | 主站接线：断点续播（2 小时会话） | PARTIAL | music-station-audit.md |
| A51 | 主站接线：灵动岛音乐卡 | PARTIAL | music-station-audit.md |
| A52 | 下载页：隐藏页 radio.qianzhi.pw/download.html | PARTIAL | music-station-audit.md |
| A53 | 下载页：本站账号门（先注册） | PARTIAL | music-station-audit.md |
| A54 | 下载页：点下载先校验 playable=true 且 trial=false | PARTIAL | music-station-audit.md |
| A55 | 下载页：走 Worker /api/dl/* 验本站 Bearer token | PARTIAL | music-station-audit.md |
| A56 | 下载页：下载日志进 music_download_logs，后台只读查看 | PARTIAL | music-station-audit.md |
| A57 | 部署链路：deploy-music.yml（main 推生产、特性分支推预览） | PARTIAL | music-station-audit.md |
| A58 | 文档：FOLIA_UPSTREAM.md 版本记录与实际 pin 一致性 | PARTIAL | music-station-audit.md |
| A59 | 免费曲库：许可过滤（仅 CC/公有领域） | PARTIAL | music-station-audit.md |
| B1 | 入口与部署形态：发现页进签名页，独立静态页 | PASS | signature-audit.md |
| B2 | 输入中文名、英文名（两个名字） | PASS | signature-audit.md |
| B3 | 单人/双人模式切换 | PASS | signature-audit.md |
| B4 | 中文字体切换：霞鹜文楷 / 志莽行书 | PASS | signature-audit.md |
| B5 | 英文字体切换：4 种手写字体 | PASS | signature-audit.md |
| B6 | 中文逐笔绘制：按标准笔画顺序写 | PASS | signature-audit.md |
| B7 | 英文逐笔绘制：Vara 描边动画 | PASS | signature-audit.md |
| B8 | 两个名字一起登场、一起收尾 | PASS | signature-audit.md |
| B9 | 多语言音译：韩文/日文/阿拉伯文 | PASS | signature-audit.md |
| B10 | 表外字留中文原字、中文静态显示 | PASS | signature-audit.md |
| B11 | 龘只能静态显示 | PASS | signature-audit.md |
| B12 | 旻已修（行书能手写） | PASS | signature-audit.md |
| B13 | 播放/再看一遍/自动播放/改动自动重播 | PASS | signature-audit.md |
| B14 | 纸屑 + 淡出收尾 | PASS | signature-audit.md |
| B15 | 轻音乐开关：打开能出声 | BLOCKED | signature-audit.md |
| B16 | 轻音乐开关：关闭后静音 | FAIL | signature-audit.md |
| B17 | 导出视频带音乐 | PARTIAL | signature-audit.md |
| B18 | 比例 16:9 / 9:16 / 1:1 | PASS | signature-audit.md |
| B19 | 6 种背景 | PASS | signature-audit.md |
| B20 | 背景星星 | PARTIAL | signature-audit.md |
| B21 | 颜色/大小/粗细/装饰 | PASS | signature-audit.md |
| B22 | 导出 WebM 视频 | PASS | signature-audit.md |
| B23 | 导出 MP4 | NOT_IMPLEMENTED | signature-audit.md |
| B24 | 固定 6/10 秒导出不断尾 | FAIL | signature-audit.md |
| B25 | 自动时长导出不断尾 | PASS | signature-audit.md |
| B26 | 长名字自适应（不换行、不裁切） | PARTIAL | signature-audit.md |
| B27 | 白色主题 | PASS | signature-audit.md |
| B28 | 不要 emoji | PASS | signature-audit.md |
| B29 | 无浏览器原生弹窗/下拉 | PASS | signature-audit.md |
| B30 | 字体与笔画数据本地化，无 CDN 依赖 | PASS | signature-audit.md |
| B31 | Vara.js 1.4.1 | NOT_TESTED | signature-audit.md |
| B32 | 不依赖主站登录、不写数据库 | PASS | signature-audit.md |
| B33 | 孟加拉文 | NOT_IMPLEMENTED | signature-audit.md |
| C1 | 下载普通用户应用（主站 App） | PARTIAL | apps-deploy-audit.md |
| C2 | 下载管理员应用 | PARTIAL | apps-deploy-audit.md |
| C3 | 下载音乐下载应用 | PARTIAL | apps-deploy-audit.md |
| C4 | 检测已安装版本（主站 App） | BLOCKED | apps-deploy-audit.md |
| C5 | 检查新版本（主站 App） | BLOCKED | apps-deploy-audit.md |
| C6 | 更新弹窗（主站 App） | BLOCKED | apps-deploy-audit.md |
| C7 | 更新说明显示（主站 App） | BLOCKED | apps-deploy-audit.md |
| C8 | 下载新版（主站 App 壳内） | BLOCKED | apps-deploy-audit.md |
| C9 | 强制更新提醒（主站 App） | BLOCKED | apps-deploy-audit.md |
| C10 | 应用专属公告（主站 App） | BLOCKED | apps-deploy-audit.md |
| C11 | 关闭/忽略可忽略的更新（主站 App） | BLOCKED | apps-deploy-audit.md |
| C12 | 检测已安装版本（管理版 App） | BLOCKED | apps-deploy-audit.md |
| C13 | 检查新版本（管理版 App） | BLOCKED | apps-deploy-audit.md |
| C14 | 更新弹窗（管理版 App） | BLOCKED | apps-deploy-audit.md |
| C15 | 下载新版（管理版 App 壳内） | BLOCKED | apps-deploy-audit.md |
| C16 | 强制更新提醒（管理版 App） | BLOCKED | apps-deploy-audit.md |
| C17 | 关闭/忽略可忽略的更新（管理版 App） | BLOCKED | apps-deploy-audit.md |
| C18 | 检测已安装版本（音乐下载 App） | BLOCKED | apps-deploy-audit.md |
| C19 | 检查新版本（音乐下载 App） | PARTIAL | apps-deploy-audit.md |
| C20 | 更新弹窗（音乐下载 App） | BLOCKED | apps-deploy-audit.md |
| C21 | 下载新版（音乐下载 App 壳内） | BLOCKED | apps-deploy-audit.md |
| C22 | 强制更新提醒（音乐下载 App） | NOT_IMPLEMENTED | apps-deploy-audit.md |
| C23 | 关闭/忽略可忽略的更新（音乐下载 App） | PARTIAL | apps-deploy-audit.md |
| C24 | 音乐下载 App v1.0 无软件内更新 | PARTIAL | apps-deploy-audit.md |
| C25 | 管理员发布主站新版本 | BLOCKED | apps-deploy-audit.md |
| C26 | 管理员发布管理版新版本 | BLOCKED | apps-deploy-audit.md |
| C27 | 管理员发布音乐下载版新版本 | NOT_IMPLEMENTED | apps-deploy-audit.md |
| C28 | 更新弹窗预览（后台） | BLOCKED | apps-deploy-audit.md |
| C29 | 复制下载链接 / 二维码分享 | BLOCKED | apps-deploy-audit.md |
| C30 | 看管理版发布历史 | BLOCKED | apps-deploy-audit.md |
| C31 | 看学生版发布历史 | BLOCKED | apps-deploy-audit.md |
| C32 | 发布 / 撤下应用专属公告 | BLOCKED | apps-deploy-audit.md |
| C33 | 软件成员与平台统计 | BLOCKED | apps-deploy-audit.md |
| C34 | 主站部署 GitHub Pages（deploy.yml） | PARTIAL | apps-deploy-audit.md |
| C35 | 音乐站部署（deploy-music.yml） | PARTIAL | apps-deploy-audit.md |
| C36 | 电台部署（deploy-radio.yml） | PARTIAL | apps-deploy-audit.md |
| C37 | 手动迁移（migrate.yml） | PARTIAL | apps-deploy-audit.md |
| C38 | PR 检查（verify-pr.yml / verify-music.yml） | PARTIAL | apps-deploy-audit.md |
| C39 | public/404.html 随部署上线 | PASS | apps-deploy-audit.md |
| C40 | 构建变量注入与部署状态回显 | BLOCKED | apps-deploy-audit.md |
| C41 | 部署成功邮件通知 | PARTIAL | apps-deploy-audit.md |
| C42 | 应用更新方式偏好（三处都走软件内弹框） | PARTIAL | apps-deploy-audit.md |
> 注：上表 A26、A41、B15、B16、B24、C10–C12、C24、C32 等行的状态已按 FIX-5 修复后的状态在 §4 中说明；本表记录的是**审计时的原始状态**（修复前），与三线底稿一致。B16 与 B24 在 FIX-5 后已修复，登录态/真机行为仍待验证。

## 4. 修复清单（FIX-5，10 项）

基线：`fix/audit-phase5-code` 分支，提交 `025740a`（8 个文件，+298/−19）。四项检查全过（`npm run typecheck` / `npm run build` / `npm run check:styles` / `npm run check:admin-styles`；主代理独立复跑 typecheck + build 通过；签名页 7 个 `<script>` 块 `node --check` 全过）。

| 编号 | 问题 | 严重程度 | 修复内容 | 状态 |
|---|---|---|---|---|
| FIX-5-1 | 签名页轻音乐关不掉铺底音（B16 / S1） | 高 | `public/signature/index.html`：铺底振荡器抽成 `startPad()`/`stopPad()`，模块级 `padNodes` 保存引用；`stopMusic()` 现在停旋律定时器的同时 `stopPad()`（stop + disconnect），再打开时重建；音色与音量未改 | 已修复，真机听觉待验证 |
| FIX-5-2 | 固定 6/10 秒导出截掉纸屑与淡出（B24 / S2） | 高 | 同文件：新增 `OUTRO_MS = 3000`；书写按 `target − 3` 秒拉伸（`writeTarget`，最小 1 秒），outro（纸屑 +500ms、淡出 +2100ms）落在固定时长窗口内；`exportVideo` 停录定时器改为 `target + OUTRO_MS` 兜底（停录以 outro 自身的 `stopRecording` 为准，防超长名字停不下来）。导出仍是标称 6/10 秒、结尾完整，按钮文案不用改 | 已修复，真机导出待验证 |
| FIX-5-3 | 千栀账号 overlay 里「堯」品牌残留（A S3） | 中 | `music/scripts/apply-qianzhi-account.mjs`：解开 QianzhiAccountRow.tsx 的 gzip+base64 blob，三处文案改 Class Memory 口径（「堯账号」→「Class Memory 账号」等），重新编码写回；round-trip 解码验证无「堯」 | 已修复，音乐站登录态待验证 |
| FIX-5-4 | 文档滞后 + fee=8 未单列（A S2 + A S5） | 低 | `music/FOLIA_UPSTREAM.md`：v0.7.27 / pin 4a545c9 → v0.7.28 / a44758bbc02929225ca7304b5a4c4580d7b4e87b；新增 `music/scripts/apply-folia-netease-fee8.mjs`（overlay 机制同款，幂等），把 fee 8 补进 `neteaseFailure.ts` 的 `NO_RIGHT_CASES`（`8: 'subscription-required'`）并同步注释；`deploy-music.yml` 在 NetEase sync overlay 步骤后加调用步骤。worktree 子模块实测两次运行，第二遍报 already applied，随后子模块还原干净 | 已修复，下次音乐站部署后生效 |
| FIX-5-5 | AdminAppCenter 两处过时文案（C S6-11） | 低 | `src/components/AdminAppCenter.tsx`：「手动装一次 1.1」改为动态读 `saved.app_version_name`（线上现值 1.6，今后改版不再过期）；「验完改回来」改为如实文案（发布后立即生效并写入版本历史，序号改不回旧值，只能再发更高序号的版本） | 已修复，管理员登录态待验证 |
| FIX-5-6 | 导出带音乐无说明（B PARTIAL） | 低 | `public/signature/index.html` 注意段落追加一句：「导出视频有没有音乐，看上面「轻音乐」开关：开着导出带音乐，关着导出就是静音的。」导出逻辑未动 | 已修复 |
| FIX-5-7 | public_app_update 首次启动竞态（C S4） | 中 | `src/App.tsx`：`fetchAppUpdate()` 里 `member_presence` upsert 由 fire-and-forget 改为 `await`（try/catch 包住，统计失败仍不阻断更新检查），等这一行写完再调 RPC；不改其他逻辑、不加轮询 | 已修复，真机首启待验证 |
| FIX-5-8 | Jamendo secret 有无核对（A S6） | — | 经 Cloudflare API 只列 secret 名（未读值）：生产 Worker `qianzhi-music` 与预览 `qianzhi-music-preview` 均有 `JAMENDO_CLIENT_ID`（另有 `QQ_SESSION_SECRET`）。免费曲库的 Jamendo 分支在生产应可正常工作；无需用户再配 | 已确认，无需修 |
| FIX-5-9 | 队尾宽限 25 秒 vs 5 秒（A S1） | — | git 历史查清：2026-11-16 提交 bb6b870（"track-end grace"）引入时宽限是 `25000` 毫秒；2026-11-17 提交 69dffd2（PR #703，"Hide music Dynamic Island after five seconds without playback"）**有意**把两处 `25000` 改成新常量 `MUSIC_ISLAND_INACTIVE_HIDE_DELAY_MS = 5000`，并加了断言 5000 的单测。当前代码自洽（注释、常量、单测均为 5 秒），全仓无 25000。**代码与 MEMORY 均未改**，等用户定夺：接受 5 秒（MEMORY 里的「25 秒宽限」改成 5 秒），还是恢复 25 秒 | 待用户定夺 |
| FIX-5-10 | 仓库与生产库漂移收敛（part 4） | 中 | 新增幂等迁移 `20261121095000_audit_phase5_drift_convergence.sql`（220 行）：`musicdl_app_releases` 表（9 列、identity 主键、version_code 唯一、6 条 CHECK；RLS 开启、0 策略；种子行从 `site_settings` 还原，`on conflict do nothing`）+ 四个函数原文（任务书列的三个之外，实测生产库还有第四个同类函数 `admin_list_musicdl_app_releases`，一并收敛）+ 按生产 proacl 的授权语句。全部定义均为生产库只读实测原文；**未给两个 public_* RPC 加任何门控**（C S3，仍等用户定夺） | 已应用到生产并回读核对（schema_migrations version `20261121014547`；四个函数定义与应用前逐字一致，proacl 一致，表 RLS 仍开启、策略数仍 0，`musicdl_app_releases` 仍恰好 1 行，`site_settings` 的 6 个 musicdl_app_* 键原值不变；生产无变化） |

## 5. 未修项（产品决策待定或需真机验证，不要擅自改）

- **C S1（高）：音乐下载版版本三方不一致。** 库里 `musicdl_app_version_name=1.2` / `code=3`（`site_settings` 与 `musicdl_app_releases` 均有）；静态 `public/app/musicdl-version.json` 仍是 1.1 / code 2；固定地址 APK 文件 md5 与 v1.1 成品逐字节一致，实为 1.1。后果：1.1 用户的软件内检查读 JSON，永远收不到 1.2；若有客户端改读 `public_musicdl_app_update()`，会得到 1.2/code 3，下载到的却是 1.1 文件。任务书与既往记录已注明「库里那套 1.2 种子不是真实版本」——1.2 从未真正打包发布。需定夺：删掉库里 1.2 种子，还是真正打出 1.2 包并同步三处。
- **C S2（中）：管理版发布历史缺 1.1。** `admin_app_releases` 只有 1.0/code 1 一行，但 `site_settings` 已是 1.1/code 2；而 `admin_publish_admin_app_release` 会同时写历史 + 设置 + 审计日志——说明 1.1 是直接改 `site_settings` 发布的，审计链断了一环。学生版历史完整（1.4/1.5/1.6）。需定夺是否补录 1.1。
- **C S3（中）：`public_admin_app_update` 与 `public_musicdl_app_update` 无任何门控**（不验登录/角色/joined/presence），而 `public_app_update` 要求登录 + `joined=true` + mobile presence 行。暴露的只是版本元数据，但匿名用户也能调这两个 RPC 读到管理版/音乐下载版的版本与下载地址，与主站口径不一致。需定夺是否加门。
- **A S7（中）：酷狗「在但点不了」。** 需定夺补配酷狗后端，还是在界面隐藏该行。
- **A S9（中）：音乐站登录仍直连 supabase.co**，与下载页同源代理做法不一致；手机上若出现 Failed to fetch 需后续加代理（是否出现未确认）。需定夺是否现在就做同源登录代理。
- **C S6（低）：音乐下载版无后台发布入口**（全仓无 `admin_publish_musicdl_app_release` 调用方）。需定夺是否加。
- **A S1（见 FIX-5-9）：队尾宽限 5 秒还是 25 秒**，等用户定夺。
- **B NI：MP4 导出、孟加拉文**（`map` 里已有 bn 映射数据，但 `LANGS` 无入口，注释称缺整形器）。产品决策，未做。
- **登录态/真机验证缺口**：A 线 13 项 BLOCKED（搜索、曲目详情、封面、播放/暂停、上下首、调进度、胶囊控制、展开/收起、播放器内歌词、歌词显示、邮箱登录、用户名登录）需网易云 + QQ + 游客三组实测；B15 签名页轻音乐须真机耳朵验（开到底响不响、关后铺底音是否还在）；逐笔动画观感、长名字排布、6 秒导出结尾须真机眼睛验；C 线 26 项 BLOCKED 需真机安装/真机更新弹窗/管理员登录验证，其中强制更新、发布新版本、应用专属公告不得用真实操作测试；1.8MB 签名页单文件弱网首屏加载未实测。
- 其他低优先级：二维码走第三方 api.qrserver.com；GitHub Pages `https_enforced` 仍为 `false`（API 实测）；两套更新检查逻辑分别维护；连通性检查粗糙（只测学生版地址，404 也判 ok）；背景星星是死代码（6 个背景 `stars` 全 false，`drawStars` 永远提前返回）；长名字自适应只有拉丁段有实测重建闭环，中文段只靠估算。

## 6. 工作底稿

- `audit-phase5-work/music-station-audit.md`（A 线，59 项）
- `audit-phase5-work/signature-audit.md`（B 线，33 项）
- `audit-phase5-work/apps-deploy-audit.md`（C 线，42 项）

三线底稿均为本地未跟踪文件，不进仓库提交；报告与计数以本文件为准。

## 7. 跨阶段待办（全站汇总时一并带上）

- **L-03（未完成，等用户手机确认）**：注册页《隐私政策与用户协议》复选框初始状态——代码 `policyAccepted` 初始 `false`（门禁真实存在），但第 1 阶段云浏览器报告称「默认已勾选」。云浏览器复核被挡（站点处于已登录态，不退出用户账号的前提下进不了注册页）。已请用户在手机上用浏览器无痕/隐私标签打开 qianzhi.pw 进注册页看复选框初始是勾着还是没勾，仍在等回复；收到后填入 AUDIT_PHASE_2.md §7 定论。
- **时光胶囊隐私缺口（第 3 阶段遗留，高优先级，未动手）**：生产 `tc_sel` 策略无 `open_at` 门控，未开启的公开胶囊任何成员经直连 API 能读到完整标题与内容；简单加门控会把锁信封 UI 整行藏掉，正确修法是 RPC 只返元数据，需另立方案。
- **灵动岛去留（第 3 阶段遗留）**：全套仍在线（14 个组件 + `src/lib/island/` + App 约 20 处接线 + 设置入口 + 任务抽屉），与用户此前「彻底删除」要求冲突，需用户定夺保留还是删除。
- **权限口径类（第 4 阶段遗留）**：邀请码归普通管理员还是只归超管；公告横幅保存归超管还是放宽策略/改走 RPC；admin_update_profile 是否加「禁改超管目标」；site_settings 的 ss_sel=true 是否收紧（收紧前注意 main.tsx 标题读与主站若干读依赖）；全站通知只见本人（nt_sel 仅本人，涉隐私）；定向消息「仅超管」服务端只验 admin；健康检查探针 key 归属（前端硬编码 `sb_publishable_4dNtXkAYz6Q2KE0hZdZyKw_vF7b9T5q` 以 401 判正常，第 2 阶段已怀疑属旧项目，属实则恒报正常=假阳性）。
- **其他（第 4 阶段遗留）**：生产缺 guest_show_love_wall / guest_show_announcements / guest_schedule 三行，界面默认值兜底显示「已开启」（与第 1 阶段游客 fail-open 同源）；生产 site_subtitle 仍为废弃副标题「连接人与内容」；admin-bulk-email / maintenance-notify 无 CI 部署步骤，线上版本无法核对；审核中心「退回待审核/重新打开」与回收站「彻底清理」是否补。
- **全站最大验证缺口**：登录态 BLOCKED 项（第 2 阶段 106 + 第 3 阶段 152 + 第 4 阶段 175 + 第 5 阶段 40 = 473 项）没有可登录测试账号就一直挂着，不要猜成可用；后续若用户提供测试账号或后台测试账号快切可用，再逐项实测。
