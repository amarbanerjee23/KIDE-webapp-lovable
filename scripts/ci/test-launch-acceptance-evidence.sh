#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Launch acceptance CI failure: $*" >&2
  exit 1
}

bash -n scripts/launch/capture-acceptance.sh

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat >"$tmp/good.json" <<'JSON'
{
  "acceptedAt": "2026-10-03T00:00:00Z",
  "branch": "main",
  "checks": {
    "gcpLaunchPreflight": {
      "outputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "status": "passed"
    },
    "liveSmoke": {
      "outputSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "status": "passed"
    }
  },
  "commitSha": "1234567890abcdef1234567890abcdef12345678",
  "operator": "ci",
  "productionOrigin": "https://kide.example.test",
  "releaseVersion": "1.0.0",
  "restoreDrillReference": "restore-drill-ci",
  "schemaVersion": 1,
  "secretsCaptured": false
}
JSON

bun scripts/launch/verify-acceptance.ts "$tmp/good.json"

python3 - "$tmp/good.json" "$tmp/bad.json" <<'PY'
import json
import sys
source, target = sys.argv[1:]
payload = json.load(open(source, encoding="utf-8"))
payload["checks"]["liveSmoke"]["status"] = "failed"
json.dump(payload, open(target, "w", encoding="utf-8"))
PY

if bun scripts/launch/verify-acceptance.ts "$tmp/bad.json" >/dev/null 2>&1; then
  fail "verifier accepted a failed smoke check"
fi

grep -q 'RESTORE_DRILL_REF' scripts/launch/capture-acceptance.sh   || fail "collector must require restore drill evidence"
grep -q 'git rev-parse HEAD' scripts/launch/capture-acceptance.sh   || fail "collector must bind acceptance to the exact Git commit"
grep -q 'sha256sum' scripts/launch/capture-acceptance.sh   || fail "collector must checksum preflight and smoke outputs"
grep -q 'secretsCaptured.*False' scripts/launch/capture-acceptance.sh   || fail "collector must explicitly record that secrets are excluded"
grep -q 'launch-evidence/' .gitignore   || fail "runtime launch evidence must not be committed accidentally"

echo "Launch acceptance evidence contracts passed."
