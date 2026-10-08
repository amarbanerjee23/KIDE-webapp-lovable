#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Launch acceptance CI failure: $*" >&2
  exit 1
}

bash -n scripts/launch/capture-acceptance.sh
bash -n deploy/gcp/qualify-live-deployment.sh

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat >"$tmp/good.json" <<'JSON'
{
  "acceptedAt": "2026-10-08T00:00:00Z",
  "branch": "main",
  "checks": {
    "gcpLaunchPreflight": {
      "outputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "status": "passed"
    },
    "liveSmoke": {
      "outputSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "status": "passed"
    },
    "deploymentQualification": {
      "outputSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "status": "passed"
    }
  },
  "commitSha": "1234567890abcdef1234567890abcdef12345678",
  "deployment": {
    "schemaVersion": 1,
    "qualifiedAt": "2026-10-08T00:00:00Z",
    "projectId": "test-project",
    "region": "us-central1",
    "serviceName": "kide-webapp",
    "serviceUrl": "https://kide.example.test",
    "commitSha": "1234567890abcdef1234567890abcdef12345678",
    "buildImage": "us-central1-docker.pkg.dev/test-project/kide/kide-webapp:1234567890abcdef1234567890abcdef12345678",
    "latestReadyRevision": "kide-webapp-00042-abc",
    "revisionImage": "us-central1-docker.pkg.dev/test-project/kide/kide-webapp@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "imageDigest": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "cloudSqlConnection": "test-project:us-central1:kide-web-app",
    "authDeploymentState": "configured",
    "trafficPercent": 100,
    "secretsCaptured": false
  },
  "operator": "ci",
  "productionOrigin": "https://kide.example.test",
  "releaseVersion": "1.0.0",
  "restoreDrillReference": "restore-drill-ci",
  "schemaVersion": 2,
  "secretsCaptured": false
}
JSON

bun scripts/launch/verify-acceptance.ts "$tmp/good.json"

python3 - "$tmp/good.json" "$tmp/bad-check.json" "$tmp/bad-commit.json" <<'PY'
import json
import sys

source, bad_check, bad_commit = sys.argv[1:]
payload = json.load(open(source, encoding="utf-8"))

failed = json.loads(json.dumps(payload))
failed["checks"]["deploymentQualification"]["status"] = "failed"
json.dump(failed, open(bad_check, "w", encoding="utf-8"))

drifted = json.loads(json.dumps(payload))
drifted["deployment"]["commitSha"] = "0000000000000000000000000000000000000000"
json.dump(drifted, open(bad_commit, "w", encoding="utf-8"))
PY

if bun scripts/launch/verify-acceptance.ts "$tmp/bad-check.json" >/dev/null 2>&1; then
  fail "verifier accepted a failed deployment qualification check"
fi
if bun scripts/launch/verify-acceptance.ts "$tmp/bad-commit.json" >/dev/null 2>&1; then
  fail "verifier accepted deployment evidence for a different commit"
fi

grep -q 'RESTORE_DRILL_REF' scripts/launch/capture-acceptance.sh ||
  fail "collector must require restore drill evidence"
grep -q 'git rev-parse HEAD' scripts/launch/capture-acceptance.sh ||
  fail "collector must bind acceptance to the exact Git commit"
grep -q 'qualify-live-deployment.sh' scripts/launch/capture-acceptance.sh ||
  fail "collector must qualify the exact deployed Cloud Run revision"
grep -q 'deploymentQualification' scripts/launch/capture-acceptance.sh ||
  fail "collector must record deployment qualification"
grep -q 'sha256sum' scripts/launch/capture-acceptance.sh ||
  fail "collector must checksum qualification outputs"
grep -q 'secretsCaptured.*False' scripts/launch/capture-acceptance.sh ||
  fail "collector must explicitly record that secrets are excluded"
grep -q 'launch-evidence/' .gitignore ||
  fail "runtime launch evidence must not be committed accidentally"

echo "Launch acceptance evidence contracts passed."
