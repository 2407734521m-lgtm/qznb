# Mineradio 网页版 · radio.qianzhi.pw

独立站点，与主站 (qianzhi.pw) 和 Folia 音乐站 (music.qianzhi.pw) 互不影响。

## 来源与许可证

渲染层来自开源项目 **Mineradio v2.2.0**（作者 XxHuberrr，
上游仓库 https://github.com/XxHuberrr/Mineradio ，提交 d43de56），
许可证 **GPL-3.0-only**（见本目录 `LICENSE`，署名与第三方声明见 `NOTICE.md`）。
本目录即为改版后的完整源码，同样以 GPL-3.0 提供。

## 结构

- `public/` — 上游渲染层整套搬运（Three.js r128 / GSAP 均为本地 vendor，未改）；
  桌面歌词窗 `desktop-lyrics.html` 未部署。
- `public/css/radio-web.css` + `public/js/radio-web-shim.js` — 网页版覆盖层：
  隐藏未开放音源与桌面专属入口、竖屏最小补丁。
- `worker/index.mjs` — Cloudflare Worker 入口：静态托管 + `/api/*` 翻译层。
- `wrangler.jsonc` — Worker `qianzhi-radio`，自定义域 radio.qianzhi.pw。

## 接口适配

Mineradio 渲染层调用自家归一化 `/api/*`；Worker 把它们翻译到现网
Workers 网易云 API（`https://music.qianzhi.pw/api/netease`，XEAPI）。
登录 Cookie 只存访客浏览器（本站 `mr_session`，HttpOnly），服务端不落盘，
与 Folia 的浏览器持有模式一致。

一期范围（网易云）：搜索、播放地址（含试听判定与同曲匹配兜底）、歌词、
歌单详情/分页、用户歌单、首页推荐、专辑、歌手、红心、收藏、扫码登录、
封面/音频代理（含 Range）。

一期未开放（入口隐藏 + 接口返回未开放形状）：

- QQ 音乐 / 酷狗 / 汽水音乐 / Spotify 全部音源
- 播客 DJ 服务端节拍分析、节拍图磁盘缓存（降级为浏览器本地）、听歌 journal
- 评论（XEAPI 未开放评论路由，返回空列表）、新建网易云歌单（同上）
- 播客热门/详情/节目列表（XEAPI 未开放 dj 路由；播客搜索可用）
- 天气电台、Cuefield 自动混音
- 桌面专属：本地曲库、内置歌单、Wallpaper Engine、桌面歌词窗、GPU/内存面板

移动端默认画质：上游 fx 默认即 `eco` 档（DPR 上限 0.95、像素预算 240 万），
外加竖屏 CSS 补丁；横屏布局未改动。

## 部署

推送到 main 且改动 `radio/**` 时由 `.github/workflows/deploy-radio.yml`
自动部署（wrangler）。仅新增本目录与该 workflow，不影响既有部署。

## 二期修复补丁（2026-11-08，针对云浏览器真页面验收的 5 项问题）

以下改动均为网页版定向补丁（注释中带 `radio-web 二期` 标记），上游桌面版行为不受影响：

1. **访客点播误报「未登录」** — `worker/index.mjs`：
   `classifyNeteasePlaybackRestriction` 把上游明确 404/403（无地址、无试听）的判定
   前置到登录判定之前，归类 `copyright_unavailable`（文案：网易云没有返回这首歌的
   播放地址，多为版权下架或地区限制）。此前游客点任何拿不到地址的歌都被误标
   `login_required` 并触发自动弹登录框。另在 `resolveNeteaseDirectSongUrl` 中
   对明确 404 提前退出逐档音质重试（各档实测均为同一 404），同曲匹配仍照常兜底。
   背景事实：游客态经 XEAPI 取址，大量主流曲目返回 code=404 无地址（实测
   屋顶/晴天/稻香/麻雀等皆然，加 realIP、匿名 Cookie 亦然），仅少数曲目可游客直出
   完整地址；这与 Folia 共用同一上游、行为一致，能出地址的歌本补丁前后都可正常播。
2. **3D 歌单架 / 视觉预设入口不可见** — `public/js/preload-mode.js`、
   `public/js/modules/00-state/02-preferences-ui-modes.js`：
   新访客原本默认「简约模式」，而视觉控制台按钮（#fx-fab）、预设格与歌单架设置
   整组挂在 DIY 玩家模式下被隐藏/拒绝打开。网页版改为未存偏好时默认开启 DIY
   模式（用户手动关过、存了 '0' 的仍尊重其选择）。
   打开路径：右上角「DIY」已默认开 → 右下角滑杆图标打开「视觉控制台」→
   面板内选视觉预设；「歌单架」一段切到「舞台」即扇形 3D 唱片架（侧栏模式为贴边架）。
3. **「心愿是」弹窗反复自动弹出** — 三处：
   `05-playback/11-provider-fallback.js` 删除点播受限时 520ms 后自动打开登录框的
   逻辑（只保留提示卡，文案同步去掉「正在打开对应登录入口」）；
   `08-account/05-startup-login-guide.js` 网页版关闭启动/状态触发的自动登录引导；
   `08-account/00-login-easter-egg.js` 浏览器环境直接视为彩蛋已解锁（网页无桌面桥，
   彩蛋门会把扫码登录区永久盖住）。手动点右上角头像登录不受影响，打开即扫码区。
4. **首页背景视频报错字样** — `public/js/radio-web-shim.js`：
   捕获阶段监听 video/source 的 error 事件，出错的视频元素立即隐藏，
   canplay 后自动恢复；避免浏览器把媒体错误占位字样画在首屏。
   （代码层核查：三处背景 video 元素默认均无 src 且不可见，动态视频仅来自
   用户本地文件/IndexedDB，无默认远程视频资源；此项为防御性降级，待真页面复核。）
