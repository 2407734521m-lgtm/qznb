#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 生成 Supabase Database Types（src/lib/database.types.ts）
#
# 项目保护：本仓库的类型只能来自 Supabase Project B。
#   Project B（现生产）: ldypnxxxgscibopgiaso  (class-youth-archive2, 新加坡)
#   Project A（旧/回滚）: 另一个项目 —— 绝对不能用它生成类型。
#
# 安全措施：
#   1. 校验 Supabase CLI 已安装且主版本为 v2，旧版/未知版本直接终止；
#   2. 校验当前 `supabase link` 的关联项目 ref 必须是 Project B，
#      未关联或关联了其他项目立即终止；
#   3. 生成命令显式带 --project-id 再次锁定 Project B；
#   4. 先生成到同目录临时文件，命令成功且结果非空后才用 mv 原子替换
#      正式文件 —— 生成失败时原有 database.types.ts 保持不变，
#      临时文件会被清理，并以非零码退出。
#
# 前提：已安装 Supabase CLI v2 并登录（supabase login，或设置
# SUPABASE_ACCESS_TOKEN）。详见 docs/phase1-foundation.md 的类型文件一节。
# ---------------------------------------------------------------------------
set -euo pipefail

EXPECTED_REF="ldypnxxxgscibopgiaso"
TARGET="src/lib/database.types.ts"
cd "$(dirname "$0")/.."

# --- 1. CLI 存在性 + v2 版本检查 -----------------------------------------
if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ 未找到 supabase CLI。请先安装 Supabase CLI v2（见 docs/phase1-foundation.md），再运行本脚本。" >&2
  exit 1
fi

CLI_VERSION_RAW="$(supabase --version 2>/dev/null || true)"
CLI_MAJOR="$(printf '%s' "$CLI_VERSION_RAW" | grep -oE '[0-9]+' | head -n 1 || true)"
if [ "$CLI_MAJOR" != "2" ]; then
  echo "✗ 需要 Supabase CLI v2，当前检测到的版本为「${CLI_VERSION_RAW:-未知}」，终止生成。" >&2
  echo "  旧版本（v1）的参数与关联状态格式可能不兼容，请升级到 v2 后再运行。" >&2
  exit 1
fi
echo "✓ Supabase CLI 版本检查通过：$CLI_VERSION_RAW"

# --- 2. 关联项目 ref 校验 --------------------------------------------------
LINKED_REF_FILE="supabase/.temp/project-ref"

if [ ! -f "$LINKED_REF_FILE" ]; then
  echo "✗ 当前目录尚未关联 Supabase 项目，终止生成。" >&2
  echo "  请先执行：supabase link --project-ref $EXPECTED_REF" >&2
  exit 1
fi

ACTUAL_REF="$(tr -d '[:space:]' < "$LINKED_REF_FILE")"
if [ "$ACTUAL_REF" != "$EXPECTED_REF" ]; then
  echo "✗ 当前关联项目是 $ACTUAL_REF，不是 Project B（$EXPECTED_REF），终止生成。" >&2
  echo "  本仓库禁止用其他项目（尤其 Project A）的结构生成类型。" >&2
  echo "  如需切换关联：supabase link --project-ref $EXPECTED_REF" >&2
  exit 1
fi
echo "✓ 关联项目校验通过：Project B（$EXPECTED_REF）"

# --- 3. 生成到临时文件，成功且非空后原子替换 -------------------------------
# 临时文件放在与目标相同的目录，保证 mv 是同文件系统的原子重命名；
# 文件名不以 .ts 结尾，即使异常残留也不会被 tsc/vite 当成源码。
TMP_FILE="$(mktemp "./src/lib/.database.types.tmp.XXXXXX")"
cleanup() { rm -f "$TMP_FILE"; }
trap cleanup EXIT

echo "开始生成类型（临时文件 → 校验 → 原子替换）…"
if ! supabase gen types typescript --project-id "$EXPECTED_REF" --schema public > "$TMP_FILE"; then
  echo "✗ 类型生成命令失败，已保留原有 $TARGET 不变。" >&2
  exit 1
fi

if [ ! -s "$TMP_FILE" ]; then
  echo "✗ 生成结果为空，视为失败，已保留原有 $TARGET 不变。" >&2
  exit 1
fi

# 规范化已确认的 IDENTITY 主键 Insert 字段与高频 RPC 返回类型。
# 处理失败时不替换正式文件，确保类型生成仍是原子操作。
if ! node scripts/normalize-database-types.mjs "$TMP_FILE"; then
  echo "✗ 类型规范化失败，已保留原有 $TARGET 不变。" >&2
  exit 1
fi

mv "$TMP_FILE" "$TARGET"
trap - EXIT
echo "✓ 已生成并替换 $TARGET，请接着运行：npm run typecheck"
