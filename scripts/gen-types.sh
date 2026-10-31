#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 生成 Supabase Database Types（src/lib/database.types.ts）
#
# 项目保护：本仓库的类型只能来自 Supabase Project B。
#   Project B（现生产）: ldypnxxxgscibopgiaso  (class-youth-archive2, 新加坡)
#   Project A（旧/回滚）: 另一个项目 —— 绝对不能用它生成类型。
#
# 生成前会校验当前 `supabase link` 的关联项目 ref：
#   - 未关联            → 终止，并提示先执行关联命令；
#   - 关联的不是 B      → 立即终止（防止误生成 Project A 的结构）；
#   - 关联正确          → 用显式 --project-id 再次锁定 B 后生成。
#
# 前提：已安装 Supabase CLI v2 并登录（supabase login，或设置
# SUPABASE_ACCESS_TOKEN）。详见 docs/phase1-foundation.md 的类型文件一节。
# ---------------------------------------------------------------------------
set -euo pipefail

EXPECTED_REF="ldypnxxxgscibopgiaso"
cd "$(dirname "$0")/.."

LINKED_REF_FILE="supabase/.temp/project-ref"

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ 未找到 supabase CLI。请先安装 Supabase CLI v2（见 docs/phase1-foundation.md），再运行本脚本。" >&2
  exit 1
fi

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

echo "✓ 关联项目校验通过：Project B（$EXPECTED_REF），开始生成类型…"
supabase gen types typescript --project-id "$EXPECTED_REF" --schema public > src/lib/database.types.ts
echo "✓ 已生成 src/lib/database.types.ts，请接着运行：npm run typecheck"
