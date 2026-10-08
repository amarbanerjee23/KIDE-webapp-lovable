#!/usr/bin/env bash
set -euo pipefail

ACCEPTANCE_FILE="${ACCEPTANCE_FILE:-}"
EXPECTED_COMMIT_SHA="${EXPECTED_COMMIT_SHA:-}"

fail() {
  echo "Release publication validation failed: $*" >&2
  exit 1
}

[[ -n "${ACCEPTANCE_FILE}" ]] || fail "ACCEPTANCE_FILE is required."
[[ -f "${ACCEPTANCE_FILE}" ]] || fail "Acceptance evidence file does not exist."

bun scripts/launch/verify-acceptance.ts "${ACCEPTANCE_FILE}"

node - "${ACCEPTANCE_FILE}" "${EXPECTED_COMMIT_SHA}" <<'JS'
const fs = require("fs");

const [acceptancePath, expectedCommit] = process.argv.slice(2);
const acceptance = JSON.parse(fs.readFileSync(acceptancePath, "utf8"));
const release = JSON.parse(fs.readFileSync("release.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

function fail(message) {
  throw new Error(message);
}

if (release.status !== "release-candidate") {
  fail("release.json must remain release-candidate before publication");
}
if (release.requiresLaunchAcceptanceEvidence !== true) {
  fail("release must require launch acceptance evidence");
}
if (release.graphSynthesisDefaultOn !== false) {
  fail("graph-assisted synthesis must remain default-off for v1.0.0");
}
if (pkg.version !== release.releaseVersion) {
  fail("package version does not match release metadata");
}
if (acceptance.releaseVersion !== release.releaseVersion) {
  fail("acceptance releaseVersion does not match release metadata");
}
if (release.tag !== `v${release.releaseVersion}`) {
  fail("release tag does not match releaseVersion");
}
if (expectedCommit && acceptance.commitSha !== expectedCommit) {
  fail(
    `acceptance commit ${acceptance.commitSha} does not match expected main commit ${expectedCommit}`,
  );
}

console.log(
  JSON.stringify(
    {
      version: release.releaseVersion,
      tag: release.tag,
      commitSha: acceptance.commitSha,
      productionOrigin: acceptance.productionOrigin,
      acceptedAt: acceptance.acceptedAt,
      restoreDrillReference: acceptance.restoreDrillReference,
      deploymentRevision: acceptance.deployment.latestReadyRevision,
      deploymentImageDigest: acceptance.deployment.imageDigest,
      deploymentBuildImage: acceptance.deployment.buildImage,
    },
    null,
    2,
  ),
);
JS
