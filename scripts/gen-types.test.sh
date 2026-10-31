#!/usr/bin/env bash
# Tests the guarded type-generation pipeline without a real Supabase connection.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0
FAIL=0

B="ldypnxxxgscibopgiaso"
A="wnddwkdfndrkxivvrxcy"
IDENTITY_TABLES=(
  album_photos albums backup_logs board_messages comments events greetings
  hot_snippets notifications posts reports time_capsules timelines wishes
)

# Minimal generated-file fixture: every expected table and RPC is present.
{
  echo 'export type Database = {'
  echo '  public: {'
  echo '    Tables: {'
  for table in "${IDENTITY_TABLES[@]}"; do
    printf '      %s: {\n        Row: { id: number }\n        Insert: {\n          id: number\n        }\n        Update: { id?: number }\n      }\n' "$table"
  done
  echo '    }'
  echo '    Views: {'
  echo '    }'
  echo '    Functions: {'
  for fn in admin_presence_summary public_guest_landing member_directory member_detail my_role; do
    printf '      %s: {\n        Args: Record<PropertyKey, never>\n        Returns: unknown\n      }\n' "$fn"
  done
  echo '    }'
  echo '    Enums: {'
  echo '    }'
  echo '  }'
  echo '}'
} > "$WORK/types.fixture.ts"

mkdir -p "$WORK/bin"
cat > "$WORK/bin/supabase" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "--version" ]; then
  echo "${STUB_VER:-2.54.4}"
  exit 0
fi
if [ "$1" = "gen" ]; then
  case "${STUB_GEN:-ok}" in
    ok)    [ -s "$STUB_TYPES_FIXTURE" ] || { echo "fixture missing: $STUB_TYPES_FIXTURE" >&2; exit 4; }; cat "$STUB_TYPES_FIXTURE" || exit 4; exit 0 ;;
    fail)  echo "// partial garbage"; exit 3 ;;
    empty) exit 0 ;;
  esac
fi
exit 0
STUB
chmod +x "$WORK/bin/supabase"
export PATH="$WORK/bin:$PATH"
export STUB_TYPES_FIXTURE="$WORK/types.fixture.ts"

run_case() {
  local name="$1" ref="$2" ver="$3" gen_mode="$4" want_success="$5"
  local dir="$WORK/$name"
  mkdir -p "$dir/scripts" "$dir/src/lib"
  cp "$SCRIPT_DIR/gen-types.sh" "$dir/scripts/"
  cp "$SCRIPT_DIR/normalize-database-types.mjs" "$dir/scripts/"
  printf '// ORIGINAL SENTINEL\n' > "$dir/src/lib/database.types.ts"

  local code=0
  (cd "$dir" && STUB_VER="$ver" STUB_GEN="$gen_mode" bash scripts/gen-types.sh >/dev/null 2>&1) || code=$?
  local content
  content="$(cat "$dir/src/lib/database.types.ts")"
  local leftovers
  leftovers="$(find "$dir/src/lib" -maxdepth 1 -name '.database.types.tmp.*' | wc -l | tr -d ' ')"
  local ok=1

  if [ "$want_success" = "yes" ]; then
    [ "$code" -eq 0 ] || ok=0
    [ "$(grep -Fxc '          id?: number' "$dir/src/lib/database.types.ts" || true)" = "14" ] || ok=0
    grep -Fq 'Returns: { online_count: number; active_count: number; sampled_at: string }' "$dir/src/lib/database.types.ts" || ok=0
    grep -Fq 'Returns: { site_title: string;' "$dir/src/lib/database.types.ts" || ok=0
    grep -Fq 'Returns: { id: string; username: string; display_name: string | null;' "$dir/src/lib/database.types.ts" || ok=0
    grep -Fq 'Returns: { id: string; username: string; display_name: string | null; age: number | null;' "$dir/src/lib/database.types.ts" || ok=0
    grep -Fq 'Returns: string | null' "$dir/src/lib/database.types.ts" || ok=0
    # Normalization must be idempotent.
    (cd "$dir" && node scripts/normalize-database-types.mjs src/lib/database.types.ts >/dev/null) || ok=0
  else
    [ "$code" -ne 0 ] || ok=0
    [ "$content" = "// ORIGINAL SENTINEL" ] || ok=0
  fi

  [ "$leftovers" = "0" ] || ok=0
  if [ "$ok" = "1" ]; then
    PASS=$((PASS+1))
    echo "PASS  $name"
  else
    FAIL=$((FAIL+1))
    echo "FAIL  $name (exit=$code leftovers=$leftovers)"
  fi
}

run_case success          "$B" "2.54.4"  "ok"    yes
run_case generation-fails "$B" "2.54.4"  "fail"  no
run_case empty-output     "$B" "2.54.4"  "empty" no
run_case cli-v1           "$B" "1.226.4"  "ok"    no
run_case linked-to-a      "$A" "2.54.4"  "ok"    no
run_case not-linked       ""   "2.54.4"  "ok"    no

echo "----------------------------------------"
echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
