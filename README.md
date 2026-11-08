# 我们的班级 · 青春档案（v0.1 核心版）
React + Vite + TS + Supabase，部署在 GitHub Pages。**请先放进新仓库或新分支试用，不要覆盖旧代码。**

## 一、Supabase（手机浏览器，用「桌面版网站」更方便）
1. 新建项目 → SQL Editor → 粘贴 `supabase/migrations/001_init.sql` 全部内容 → Run（可重复运行）。
2. Authentication → Providers → Email：**关闭 Confirm email**（本版用用户名登录，没有真实邮箱）。
3. SQL Editor 设置邀请码：
   `insert into app_settings(id, invite_code) values (1,'你的邀请码') on conflict (id) do update set invite_code = excluded.invite_code;`
4. 网站上注册你自己的账号，然后在 SQL Editor 运行一次（仅在没有超级管理员时有效）：
   `select bootstrap_super_admin('你的用户名');`
5. Project Settings → API：记下 Project URL 和 anon/publishable key。**不要使用 service_role。**

## 二、GitHub
1. 仓库 Settings → Secrets and variables → Actions → 新建 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
2. Settings → Pages → Source 选 **GitHub Actions**。
3. 文件管理器默认隐藏 `.github` 文件夹，上传可能漏掉。请在 GitHub 网页 Add file → Create new file，路径填 `.github/workflows/deploy.yml`，内容粘贴自 `github-workflow-deploy.yml`。
4. 推送到 main 后，Actions 页面会自动构建并部署。

## 已知限制
见聊天说明：时间线、相册、动态、管理后台界面、密码重置尚未实现；代码未经过构建和真机测试。
