#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-kide-webapp}"
KIDE_URL="${KIDE_URL:-}"
OPERATOR="${OPERATOR:-}"
RESTORE_DRILL_REF="${RESTORE_DRILL_REF:-}"
RELEASE_VERSION="${RELEASE_VERSION:-1.0.0}"
OUTPUT_DIR="${OUTPUT_DIR:-launch-evidence}"
KIDE_ACCEPTANCE_BRANCH="${KIDE_ACCEPTANCE_BRANCH:-}"

fail() {
  echo "LAUNCH ACCEPTANCE FAILED: $*" >&2
  exit 1
}

[[ -n "${PROJECT_ID}" ]] || fail "PROJECT_ID is required."
[[ -n "${KIDE_URL}" ]] || fail "KIDE_URL is required."
[[ -n "${OPERATOR}" ]] || fail "OPERATOR is required."
[[ -n "${RESTORE_DRILL_REF}" ]] || fail "RESTORE_DRILL_REF is required."

commit_sha="$(git rev-parse HEAD)"
branch_name="${KIDE_ACCEPTANCE_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "${OUTPUT_DIR}"

preflight_log="${OUTPUT_DIR}/preflight-${commit_sha}.log"
smoke_log="${OUTPUT_DIR}/smoke-${commit_sha}.log"
deployment_log="${OUTPUT_DIR}/deployment-${commit_sha}.log"
deployment_file="${OUTPUT_DIR}/deployment-qualification-${commit_sha}.json"
evidence_file="${OUTPUT_DIR}/launch-acceptance-${commit_sha}.json"

echo "Running GCP launch preflight..."
if PROJECT_ID="${PROJECT_ID}" REGION="${REGION}" SERVICE_NAME="${SERVICE_NAME}" \
   bash deploy/gcp/launch-preflight.sh >"${preflight_log}" 2>&1; then
  preflight_status="passed"
else
  cat "${preflight_log}" >&2
  fail "GCP launch preflight failed."
fi

echo "Running deployed-environment smoke..."
if KIDE_URL="${KIDE_URL}" KIDE_LAUNCH_RUN_ID="${commit_sha:0:12}" \
   bash scripts/launch/live-smoke.sh >"${smoke_log}" 2>&1; then
  smoke_status="passed"
else
  cat "${smoke_log}" >&2
  fail "Live production smoke failed."
fi

echo "Qualifying exact deployed Cloud Run revision..."
if PROJECT_ID="${PROJECT_ID}" \
   REGION="${REGION}" \
   SERVICE_NAME="${SERVICE_NAME}" \
   EXPECTED_COMMIT_SHA="${commit_sha}" \
   KIDE_URL="${KIDE_URL}" \
   OUTPUT_FILE="${deployment_file}" \
   bash deploy/gcp/qualify-live-deployment.sh >"${deployment_log}" 2>&1; then
  deployment_status="passed"
else
  cat "${deployment_log}" >&2
  fail "Live deployment qualification failed."
fi

preflight_sha="$(sha256sum "${preflight_log}" | awk '{print $1}')"
smoke_sha="$(sha256sum "${smoke_log}" | awk '{print $1}')"
deployment_sha="$(sha256sum "${deployment_file}" | awk '{print $1}')"

python3 - "${evidence_file}" "${deployment_file}" "${commit_sha}" "${branch_name}" "${timestamp}" \
  "${RELEASE_VERSION}" "${KIDE_URL}" "${OPERATOR}" "${RESTORE_DRILL_REF}" \
  "${preflight_status}" "${preflight_sha}" "${smoke_status}" "${smoke_sha}" \
  "${deployment_status}" "${deployment_sha}" <<'PY'
import json
import sys

(
    path,
    deployment_path,
    commit_sha,
    branch_name,
    timestamp,
    release_version,
    kide_url,
    operator,
    restore_drill_ref,
    preflight_status,
    preflight_sha,
    smoke_status,
    smoke_sha,
    deployment_status,
    deployment_sha,
) = sys.argv[1:]

with open(deployment_path, encoding="utf-8") as handle:
    deployment = json.load(handle)

payload = {
    "schemaVersion": 2,
    "releaseVersion": release_version,
    "commitSha": commit_sha,
    "branch": branch_name,
    "productionOrigin": kide_url.rstrip("/"),
    "acceptedAt": timestamp,
    "operator": operator,
    "restoreDrillReference": restore_drill_ref,
    "checks": {
        "gcpLaunchPreflight": {
            "status": preflight_status,
            "outputSha256": preflight_sha,
        },
        "liveSmoke": {
            "status": smoke_status,
            "outputSha256": smoke_sha,
        },
        "deploymentQualification": {
            "status": deployment_status,
            "outputSha256": deployment_sha,
        },
    },
    "deployment": deployment,
    "secretsCaptured": False,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

bun scripts/launch/verify-acceptance.ts "${evidence_file}"

echo
echo "Launch acceptance evidence created:"
echo "  ${evidence_file}"
echo "  ${deployment_file}"
echo "Retain the acceptance JSON, deployment qualification JSON and logs with the release records."
