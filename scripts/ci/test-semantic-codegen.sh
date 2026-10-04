#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Semantic codegen CI failure: $*" >&2
  exit 1
}

bunx vitest run   src/lib/kide/codegen.test.ts   src/lib/kide/release-hardening.test.ts

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

bun scripts/ci/emit-codegen-fixture.ts "$tmp"

mapfile -t python_files < <(find "$tmp/ros2" -type f -name '*.py' | sort)
[[ "${#python_files[@]}" -gt 0 ]] || fail "ROS 2 Python generation produced no Python files"
python3 -m py_compile "${python_files[@]}"

node --check "$tmp/zetta/index.js"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$tmp/zetta/package.json"

st_file="$(find "$tmp/plc" -type f -name '*.st' | head -n 1)"
[[ -n "$st_file" ]] || fail "PLC generation produced no Structured Text source"
starts="$(grep -Ec '^[[:space:]]*FUNCTION_BLOCK[[:space:]]+' "$st_file")"
ends="$(grep -Ec '^[[:space:]]*END_FUNCTION_BLOCK[[:space:]]*$' "$st_file")"
[[ "$starts" -gt 0 && "$starts" == "$ends" ]]   || fail "Structured Text FUNCTION_BLOCK markers are unbalanced"

grep -Rq 'create_publisher(String' "$tmp/ros2"   || fail "ROS 2 code must contain generated command publishers"
grep -q 'zetta-device' "$tmp/zetta/package.json"   || fail "Zetta package must declare zetta-device"
grep -Eq 'CMD_[A-Z0-9_]+' "$st_file"   || fail "PLC code must expose generated command inputs"

echo "Semantic multi-target code generation passes real syntax/toolchain checks."
