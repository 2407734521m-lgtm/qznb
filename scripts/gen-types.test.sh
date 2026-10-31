#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# gen-types.sh 的失败路径测试（不需要真实 Supabase 连接）。
#
# 用一个桩（stub）supabase CLI 模拟六种情形，断言：
#   成功时正式文件被新内容替换；其余所有失败情形下，
#   原有 src/lib/database.types.ts 内容不变、无临时文件残留、退出码非零。
#
# 运行：bash scripts/gen-types.test.sh   （全部通过时退出码为 0）
# ---------------------------------------------------------------------------
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0; FAIL=0

mkdir -p "$WORK/bin"
cat > "$WORK/bin/supabase" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "${STUB_VER:-2.54.4}"; exit 0; fi
if [ "$1" = "gen" ]; then
  case "${STUB_GEN:-ok}" in
    ok)    echo "// NEW GENERATED TYPES"; exit 0 ;;
    fail)  echo "// partial garbage";    exit 3 ;;
    empty)                               exit 0 ;;
  esac
fi
exit 0
STUB
chmod +x "$WORK/bin/supabase"
export PATH="$WORK/bin:$PATH"

run_case() {
  # $1=name $2=linked ref（空=不关联）$3=STUB_VER $4=STUB_GEN $5=期望退出（0/1）$6=期望内容
  local name="$1" ref="$2" ver="$3" gen="$4" want_exit="$5" want_content="$6"
  local d="$WORK/$name"
  mkdir -p "$d/scripts" "$d/src/lib"
  cp "$SCRIPT_DIR/gen-types.sh" "$d/scripts/"
  printf '// ORIGINAL SENTINEL\n' > "$d/src/lib/database.types.ts"
  if [ -n "$ref" ]; then
    mkdir -p "$d/supabase/.temp"
    printf '%s\n' "$ref" > "$d/supabase/.temp/project-ref"
  fi
  (cd "$d" && STUB_VER="$ver" STUB_GEN="$gen" bash scripts/gen-types.sh >/dev/null 2>&1)
  local code=$?
  local content; content="$(cat "$d/src/lib/database.types.ts")"
  local leftovers; leftovers="$(ls -a "$d/src/lib" | grep -c '^\.database\.types\.tmp\.' || true)"
  local ok=1
  if [ "$want_exit" = "0" ]; then [ "$code" -eq 0 ] || ok=0; else [ "$code" -ne 0 ] || ok=0; fi
  [ "$content" = "$want_content" ] || ok=0
  [ "$leftovers" = "0" ] || ok=0
  if [ "$ok" = "1" ]; then PASS=$((PASS+1)); echo "PASS  $name";
  else FAIL=$((FAIL+1)); echo "FAIL  $name (exit=$code content='$content' leftovers=$leftovers)"; fi
}

B="ldypnxxxgscibopgiaso"
A="wnddwkdfndrkxivvrxcy"

run_case ok-success   "$B" "2.54.4"  "ok"    0 "// NEW GENERATED TYPES"
run_case gen-fails    "$B" "2.54.4"  "fail"  1 "// ORIGINAL SENTINEL"
run_case gen-empty    "$B" "2.54.4"  "empty" 1 "// ORIGINAL SENTINEL"
run_case cli-v1       "$B" "1.226.4" "ok"    1 "// ORIGINAL SENTINEL"
run_case linked-to-a  "$A" "2.54.4"  "ok"    1 "// ORIGINAL SENTINEL"
run_case not-linked   ""   "2.54.4"  "ok"    1 "// ORIGINAL SENTINEL"

echo "----------------------------------------"
echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
