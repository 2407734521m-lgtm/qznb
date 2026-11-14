# 历史匿名表白附件迁移

`20261114101500_priority_reliability_privacy_fixes.sql` 部署后，旧格式 `<用户 UUID>/love/<文件>` 对匿名已发布帖子的原始路径会从客户端媒体列表中脱敏，Storage 读取也限制为作者和管理员。历史图片在迁移前可能暂时不向普通读者展示；这是为先关闭身份泄露而做的 fail-closed 处理。

新版本代码使用 `love/<随机 UUID>.<扩展名>`，原始对象路径不包含投稿者 ID。

## 运行步骤

1. **确认目标 Supabase 项目和备份状态。** 不要在不确定项目时运行。
2. 按项目既有发布流程应用 SQL migration。不要直接编辑或重放生产库已记录的旧 migration。
3. 在受控运维终端中通过环境变量设置该项目的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。密钥不要写进命令行参数、源码、提交、聊天或 `.env` 被提交文件。
4. 先执行只读预览：

   ```bash
   node scripts/migrate-legacy-anonymous-media.mjs
   ```

   脚本默认 dry-run，只报告匹配的匿名旧路径数量，不写 Storage 或数据库。

5. 核对目标计数、备份和维护窗口后，才由有权限的运维人员显式执行：

   ```bash
   node scripts/migrate-legacy-anonymous-media.mjs --apply
   ```

   脚本按附件逐项下载、复制为随机路径、调用 service-role-only RPC 原子更新数据库引用，然后删除旧对象。共享旧路径、归属不匹配、上传失败或 RPC 失败的条目会保留并报告，不会直接删除原对象。

6. 检查输出中的失败项；在后台和普通成员账号分别核实附件显示、下载与匿名性。完成后撤销该运维终端中的密钥环境变量，并在密钥疑似泄露时轮换。

此仓库补丁不会自动运行上述命令，也不会对任何线上项目执行数据搬迁。历史媒体搬迁需要用户 / 运维确认目标环境后单独操作。
