#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
KIDE_URL="${KIDE_URL:-}"
OPERATOR="${OPERATOR:-}"
RESTORE_DRILL_REF="${RESTORE_DRILL_REF:-}"
RELEASE_VERSION="${RELEASE_VERSION:-1.0.0}"
OUTPUT_DIR="${OUTPUT_DIR:-launch-evidence}"

fail() {
  echo "LAUNCH ACCEPTANCE FAILED: $*" >&2
  exit 1
}

[[ -n "${PROJECT_ID}" ]] || fail "PROJECT_ID is required."
[[ -n "${KIDE_URL}" ]] || fail "KIDE_URL is required."
[[ -n "${OPERATOR}" ]] || fail "OPERATOR is required."
[[ -n "${RESTORE_DRILL_REF}" ]] || fail "RESTORE_DRILL_REF is required."

commit_sha="$(git rev-parse HEAD)"
branch_name="$(git rev-parse --abbrev-ref HEAD)"
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "${OUTPUT_DIR}"

preflight_log="${OUTPUT_DIR}/preflight-${commit_sha}.log"
smoke_log="${OUTPUT_DIR}/smoke-${commit_sha}.log"
evidence_file="${OUTPUT_DIR}/launch-acceptance-${commit_sha}.json"

echo "Running GCP launch preflight..."
if PROJECT_ID="${PROJECT_ID}" bash deploy/gcp/launch-preflight.sh >"${preflight_log}" 2>&1; then
  preflight_status="passed"
else
  cat "${preflight_log}" >&2
  fail "GCP launch preflight failed."
fi

echo "Running deployed-environment smoke..."
if KIDE_URL="${KIDE_URL}" KIDE_LAUNCH_RUN_ID="${commit_sha:0:12}"   bash scripts/launch/live-smoke.sh >"${smoke_log}" 2>&1; then
  smoke_status="passed"
else
  cat "${smoke_log}" >&2
  fail "Live production smoke failed."
fi

preflight_sha="$(sha256sum "${preflight_log}" | awk '{print $1}')"
smoke_sha="$(sha256sum "${smoke_log}" | awk '{print $1}')"

python3 - "${evidence_file}" "${commit_sha}" "${branch_name}" "${timestamp}"   "${RELEASE_VERSION}" "${KIDE_URL}" "${OPERATOR}" "${RESTORE_DRILL_REF}"   "${preflight_status}" "${preflight_sha}" "${smoke_status}" "${smoke_sha}" <<'PY'
import json
import sys

(
    path,
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
) = sys.argv[1:]

payload = {
    "schemaVersion": 1,
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
    },
    "secretsCaptured": False,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

python3 scripts/launch/verify-acceptance.py "${evidence_file}"

echo
echo "Launch acceptance evidence created:"
echo "  ${evidence_file}"
echo "Retain the JSON and both logs with the release records; do not commit runtime logs."
