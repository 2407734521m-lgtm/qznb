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
