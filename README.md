# 堯

堯是一个独立运行的社区网站项目，包含成员主页、动态与帖子、私信、好友关系、匿名互动、相册、公告和管理后台等功能。

- 主站：<https://qianzhi.pw>
- 管理后台：<https://admin.qianzhi.pw>
- 音乐空间：<https://music.qianzhi.pw>

## 技术栈

- React、TypeScript、Vite
- Supabase Auth、Postgres、Realtime、Storage、Edge Functions
- GitHub Actions 与 GitHub Pages

## 仓库结构

- `src/pages`：主站页面
- `src/components`：可复用组件及管理后台模块
- `src/lib`：客户端服务、媒体、动效和工具逻辑
- `supabase/migrations`：数据库结构与权限迁移
- `supabase/functions`：服务端 Edge Functions
- `.github/workflows`：构建、检查与部署流程

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm ci
npm run dev
```

常用检查：

```bash
npm run typecheck
npm run build
npm run check:styles
npm run check:admin-styles
```

本地运行需要配置项目对应的 Supabase URL 和 publishable/anon key。不要把 service-role key、Resend API key 或其他服务端密钥放入前端环境变量或提交到仓库。

## 数据库与部署

- 新增数据库变更请创建独立、按时间排序的 SQL migration，并先审查权限、RLS 与回滚影响。
- Edge Functions 的服务端密钥通过 Supabase 项目 Secrets 配置，不写入源码。
- 生产部署以 GitHub Actions 与 Supabase 实际状态为准；PR 合并不等同于线上验收完成。

## 许可

仓库各目录和第三方依赖可能有各自的许可要求。使用或分发第三方代码前，请遵守其原始许可与署名要求。
