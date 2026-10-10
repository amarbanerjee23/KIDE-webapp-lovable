#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "PR63 production smoke repeatability failure: $*" >&2
  exit 1
}

bash -n scripts/launch/live-smoke.sh
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

cat >"$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ "$args" == *"/api/auth/sign-up/email"* ]]; then
  body=""
  while (( $# > 0 )); do
    if [[ "$1" == "--data" ]]; then
      shift
      body="$1"
      break
    fi
    shift
  done
  email="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["email"])' "$body")"
  printf '%s\n' "$email" >>"$FAKE_SIGNUPS_LOG"
  printf '{"user":{"email":"%s"}}\n' "$email"
elif [[ "$args" == *"/api/auth/get-session"* ]]; then
  email="$(tail -n 1 "$FAKE_SIGNUPS_LOG")"
  printf '{"user":{"email":"%s"}}\n' "$email"
elif [[ "$args" == *"/api/auth/health"* ]]; then
  printf '%s\n' '{"operational":true}'
elif [[ "$args" == *"url_effective"* ]]; then
  printf '%s' "$FAKE_KIDE_URL"
else
  printf '%s\n' '<html>KIDE enterprise workbench</html>'
fi
MOCK
chmod +x "$tmp/bin/curl"

for attempt in 1 2; do
  PATH="$tmp/bin:$PATH" \
  FAKE_SIGNUPS_LOG="$tmp/signups.txt" \
  FAKE_KIDE_URL=https://kide.example.test \
  KIDE_URL=https://kide.example.test \
  KIDE_LAUNCH_RUN_ID=1234567890abcdef \
    bash scripts/launch/live-smoke.sh >"$tmp/attempt-$attempt.log" 2>&1 || {
      sed -n '1,30p' "$tmp/attempt-$attempt.log" >&2
      fail "smoke invocation $attempt failed"
    }
done

[[ "$(wc -l < "$tmp/signups.txt")" -eq 2 ]] || fail "expected two smoke accounts"
[[ "$(sort -u "$tmp/signups.txt" | wc -l)" -eq 2 ]] ||
  fail "rerunning the same commit reused a smoke account"
grep -Eq '^launch-smoke-1234567890abcdef-[0-9a-f]{24}@example.com$' "$tmp/signups.txt" ||
  fail "smoke identity format is invalid"
! grep -Eq 'Kide-Launch-Smoke-[0-9a-f]+' "$tmp"/*.log ||
  fail "smoke logs must not expose generated passwords"

echo "PR63 production smoke repeatability validated."
