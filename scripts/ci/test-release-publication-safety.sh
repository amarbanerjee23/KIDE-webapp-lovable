#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Release publication safety failure: $*" >&2
  exit 1
}

workflow=".github/workflows/publish-release.yml"
test -s "$workflow" || fail "publish-release workflow missing"
bash -n scripts/release/validate-publication.sh

grep -q '^  workflow_dispatch:$' "$workflow"   || fail "official release workflow must be manual-only"
! grep -Eq '^  (push|pull_request|schedule):' "$workflow"   || fail "official release workflow must not publish from push, PR or schedule"
grep -q 'environment: production' "$workflow"   || fail "release publication must use the production environment"
grep -q 'contents: write' "$workflow"   || fail "release workflow needs explicit tag/release write permission"
grep -q 'actions: read' "$workflow"   || fail "release workflow must be able to verify main CI"
grep -q 'PUBLISH v1.0.0' "$workflow"   || fail "release workflow must require explicit publication confirmation"
grep -q 'Require successful main CI for accepted commit' "$workflow"   || fail "release workflow must verify successful main CI"
grep -q 'git ls-remote --exit-code --tags' "$workflow"   || fail "release workflow must refuse an existing tag"
grep -q 'gh release create' "$workflow"   || fail "release workflow must publish through GitHub Releases"
grep -q 'Launch acceptance evidence SHA-256' "$workflow"   || fail "release notes must retain an acceptance evidence digest"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sha="$(git rev-parse HEAD)"

cat >"$tmp/good.json" <<JSON
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
  "commitSha": "$sha",
  "operator": "ci",
  "productionOrigin": "https://kide.example.test",
  "releaseVersion": "1.0.0",
  "restoreDrillReference": "restore-drill-ci",
  "schemaVersion": 1,
  "secretsCaptured": false
}
JSON

ACCEPTANCE_FILE="$tmp/good.json" EXPECTED_COMMIT_SHA="$sha"   bash scripts/release/validate-publication.sh >/dev/null

node - "$tmp/good.json" "$tmp/bad.json" <<'JS'
const fs = require("fs");
const [source, target] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(source, "utf8"));
payload.commitSha = "0000000000000000000000000000000000000000";
fs.writeFileSync(target, JSON.stringify(payload));
JS

if ACCEPTANCE_FILE="$tmp/bad.json" EXPECTED_COMMIT_SHA="$sha"   bash scripts/release/validate-publication.sh >/dev/null 2>&1; then
  fail "publication validator accepted evidence for the wrong commit"
fi

echo "Guarded official release publication contracts passed."
