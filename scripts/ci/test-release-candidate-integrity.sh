#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Release-candidate integrity failure: $*" >&2
  exit 1
}

node - <<'JS'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const release = JSON.parse(fs.readFileSync("release.json", "utf8"));

if (release.releaseVersion !== "1.0.0") throw new Error("releaseVersion must be 1.0.0");
if (release.tag !== "v1.0.0") throw new Error("release tag must be v1.0.0");
if (release.status !== "release-candidate") throw new Error("release must remain release-candidate before production acceptance");
if (release.requiresLaunchAcceptanceEvidence !== true) throw new Error("launch acceptance evidence must be required");
if (release.requiresProductionQualification !== true) throw new Error("production deployment qualification must be required");
if (release.graphSynthesisDefaultOn !== false) throw new Error("graph synthesis must remain default-off for v1.0.0");
if (pkg.version !== release.releaseVersion) throw new Error("package version must match release metadata");
JS

grep -q '^## 1.0.0 — Release candidate$' CHANGELOG.md   || fail "CHANGELOG must contain the 1.0.0 release-candidate entry"
grep -q '^# KIDE 1.0.0 Release Notes$' docs/releases/v1.0.0.md   || fail "v1.0.0 release notes missing"
grep -q 'launch acceptance evidence verifies' docs/releases/v1.0.0.md   || fail "release notes must require verified launch acceptance evidence"
grep -q 'RELEASE_VERSION=1.0.0' docs/operations/launch-acceptance.md   || fail "launch acceptance runbook must use release version 1.0.0"
grep -q 'RELEASE_VERSION:-1.0.0' scripts/launch/capture-acceptance.sh   || fail "acceptance collector default version must be 1.0.0"
grep -q '"status": "release-candidate"' release.json   || fail "release metadata must not claim published before acceptance"
grep -q '"requiresProductionQualification": true' release.json   || fail "release metadata must require production deployment qualification"

echo "v1.0.0 release-candidate integrity contracts passed."
