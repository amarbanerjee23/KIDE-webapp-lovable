#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-kide-webapp}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-kide-web-app}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-kide}"
EXPECTED_COMMIT_SHA="${EXPECTED_COMMIT_SHA:-}"
KIDE_URL="${KIDE_URL:-}"
OUTPUT_FILE="${OUTPUT_FILE:-deployment-qualification.json}"

fail() {
  echo "LIVE DEPLOYMENT QUALIFICATION FAILED: $*" >&2
  exit 1
}

[[ -n "${PROJECT_ID}" ]] || fail "PROJECT_ID is required."
[[ "${EXPECTED_COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]] ||
  fail "EXPECTED_COMMIT_SHA must be a lowercase full Git SHA."

service_json="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json)" || fail "Cloud Run service could not be described."

service_url="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",{}).get("url",""))' <<<"${service_json}")"
[[ -n "${service_url}" ]] || fail "Cloud Run service has no reported URL."

if [[ -n "${KIDE_URL}" ]]; then
  [[ "${KIDE_URL%/}" == "${service_url%/}" ]] ||
    fail "KIDE_URL does not match the deployed Cloud Run service URL."
fi

project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
[[ -n "${project_number}" ]] || fail "Could not resolve the GCP project number."

project_run_origin="https://${SERVICE_NAME}-${project_number}.${REGION}.run.app"
trusted_origins="${service_url};${project_run_origin}"
cloud_sql_connection="${PROJECT_ID}:${REGION}:${CLOUD_SQL_INSTANCE}"
build_image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${SERVICE_NAME}:${EXPECTED_COMMIT_SHA}"

PROJECT_ID="${PROJECT_ID}" \
REGION="${REGION}" \
SERVICE_NAME="${SERVICE_NAME}" \
EXPECTED_SERVICE_URL="${service_url}" \
EXPECTED_TRUSTED_AUTH_ORIGINS="${trusted_origins}" \
EXPECTED_AUTH_DEPLOYMENT_STATE=configured \
EXPECTED_BUILD_COMMIT_SHA="${EXPECTED_COMMIT_SHA}" \
EXPECTED_BUILD_IMAGE="${build_image}" \
EXPECTED_CLOUD_SQL_CONNECTION="${cloud_sql_connection}" \
  bash deploy/gcp/verify-cloud-run-auth-config.sh

latest_revision="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",{}).get("latestReadyRevisionName",""))' <<<"${service_json}")"
[[ -n "${latest_revision}" ]] || fail "Cloud Run has no latest ready revision."

revision_json="$(gcloud run revisions describe "${latest_revision}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json)" || fail "Latest Cloud Run revision could not be described."

KIDE_SERVICE_JSON="${service_json}" \
KIDE_REVISION_JSON="${revision_json}" \
KIDE_OUTPUT_FILE="${OUTPUT_FILE}" \
KIDE_PROJECT_ID="${PROJECT_ID}" \
KIDE_REGION="${REGION}" \
KIDE_SERVICE_NAME="${SERVICE_NAME}" \
KIDE_SERVICE_URL="${service_url}" \
KIDE_EXPECTED_COMMIT="${EXPECTED_COMMIT_SHA}" \
KIDE_BUILD_IMAGE="${build_image}" \
KIDE_CLOUD_SQL_CONNECTION="${cloud_sql_connection}" \
python3 - <<'PY'
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path

service = json.loads(os.environ["KIDE_SERVICE_JSON"])
revision = json.loads(os.environ["KIDE_REVISION_JSON"])
latest = str(service.get("status", {}).get("latestReadyRevisionName", "")).strip()
traffic = service.get("status", {}).get("traffic", [])

qualified_traffic = 0
for entry in traffic if isinstance(traffic, list) else []:
    if not isinstance(entry, dict):
        continue
    percent = int(entry.get("percent", 0) or 0)
    if entry.get("revisionName") == latest or entry.get("latestRevision") is True:
        qualified_traffic += percent

if qualified_traffic != 100:
    raise SystemExit(
        "LIVE DEPLOYMENT QUALIFICATION FAILED: "
        f"latest ready revision receives {qualified_traffic}% traffic instead of 100%."
    )

containers = revision.get("spec", {}).get("containers", [])
if not containers:
    raise SystemExit(
        "LIVE DEPLOYMENT QUALIFICATION FAILED: latest revision has no container specification."
    )

revision_image = str(containers[0].get("image", "")).strip()
if not revision_image:
    raise SystemExit(
        "LIVE DEPLOYMENT QUALIFICATION FAILED: latest revision has no container image."
    )

image_digest = str(revision.get("status", {}).get("imageDigest", "")).strip()
if not image_digest and "@sha256:" in revision_image:
    image_digest = revision_image.split("@", 1)[1]
if image_digest and not image_digest.startswith("sha256:"):
    raise SystemExit(
        "LIVE DEPLOYMENT QUALIFICATION FAILED: revision image digest has an unexpected format."
    )

payload = {
    "schemaVersion": 1,
    "qualifiedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "projectId": os.environ["KIDE_PROJECT_ID"],
    "region": os.environ["KIDE_REGION"],
    "serviceName": os.environ["KIDE_SERVICE_NAME"],
    "serviceUrl": os.environ["KIDE_SERVICE_URL"].rstrip("/"),
    "commitSha": os.environ["KIDE_EXPECTED_COMMIT"],
    "buildImage": os.environ["KIDE_BUILD_IMAGE"],
    "latestReadyRevision": latest,
    "revisionImage": revision_image,
    "imageDigest": image_digest,
    "cloudSqlConnection": os.environ["KIDE_CLOUD_SQL_CONNECTION"],
    "authDeploymentState": "configured",
    "trafficPercent": qualified_traffic,
    "secretsCaptured": False,
}

path = Path(os.environ["KIDE_OUTPUT_FILE"])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"Live deployment qualification evidence created: {path}")
PY

echo "Live GCP deployment qualified for commit ${EXPECTED_COMMIT_SHA}."
