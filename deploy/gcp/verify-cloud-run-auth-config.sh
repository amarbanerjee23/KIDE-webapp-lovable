#!/usr/bin/env bash
set -euo pipefail

required=(
  PROJECT_ID
  REGION
  SERVICE_NAME
  EXPECTED_SERVICE_URL
  EXPECTED_TRUSTED_AUTH_ORIGINS
  EXPECTED_AUTH_DEPLOYMENT_STATE
  EXPECTED_BUILD_COMMIT_SHA
  EXPECTED_BUILD_IMAGE
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "${name} is required" >&2
    exit 2
  fi
done

service_json="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json)"

if [[ -z "${service_json}" ]]; then
  echo "Cloud Run authentication configuration verification failed." >&2
  echo "Service: ${SERVICE_NAME} (region: ${REGION})" >&2
  echo "The deployed service description was empty." >&2
  exit 2
fi

KIDE_SERVICE_JSON="${service_json}" \
python3 - <<'PY'
from __future__ import annotations

import json
import os
import sys

service_name = os.environ["SERVICE_NAME"]
region = os.environ["REGION"]
expected_url = os.environ["EXPECTED_SERVICE_URL"]
expected_origins = os.environ["EXPECTED_TRUSTED_AUTH_ORIGINS"]
expected_state = os.environ["EXPECTED_AUTH_DEPLOYMENT_STATE"]
expected_build_commit = os.environ["EXPECTED_BUILD_COMMIT_SHA"]
expected_build_image = os.environ["EXPECTED_BUILD_IMAGE"]
expected_cloud_sql = os.environ.get("EXPECTED_CLOUD_SQL_CONNECTION", "").strip()

if len(expected_build_commit) != 40 or any(ch not in "0123456789abcdef" for ch in expected_build_commit):
    print("Cloud Run authentication configuration verification failed.", file=sys.stderr)
    print("EXPECTED_BUILD_COMMIT_SHA must be a lowercase full Git SHA.", file=sys.stderr)
    raise SystemExit(2)

try:
    payload = json.loads(os.environ["KIDE_SERVICE_JSON"])
except json.JSONDecodeError as exc:
    print("Cloud Run authentication configuration verification failed.", file=sys.stderr)
    print(f"Service: {service_name} (region: {region})", file=sys.stderr)
    print(f"Could not parse the deployed service description: {exc}", file=sys.stderr)
    raise SystemExit(2)

status_url = str(payload.get("status", {}).get("url", "")).strip()
if status_url != expected_url:
    print("Cloud Run authentication configuration verification failed.", file=sys.stderr)
    print(f"Service: {service_name} (region: {region})", file=sys.stderr)
    print("The persisted Cloud Run service URL does not match the configured auth URL.", file=sys.stderr)
    raise SystemExit(2)

containers = (
    payload.get("spec", {})
    .get("template", {})
    .get("spec", {})
    .get("containers", [])
)
if not containers:
    print("Cloud Run authentication configuration verification failed.", file=sys.stderr)
    print(f"Service: {service_name} (region: {region})", file=sys.stderr)
    print("The deployed service has no container specification.", file=sys.stderr)
    raise SystemExit(2)

env_items = containers[0].get("env", [])
env_values = {
    item.get("name"): item.get("value", "")
    for item in env_items
    if isinstance(item, dict) and item.get("name")
}

checks = {
    "BETTER_AUTH_URL": expected_url,
    "BETTER_AUTH_TRUSTED_ORIGINS": expected_origins,
    "KIDE_AUTH_DEPLOYMENT_STATE": expected_state,
    "KIDE_BUILD_COMMIT_SHA": expected_build_commit,
    "KIDE_BUILD_IMAGE": expected_build_image,
}
for key, expected in checks.items():
    if env_values.get(key) != expected:
        print("Cloud Run authentication configuration verification failed.", file=sys.stderr)
        print(f"Service: {service_name} (region: {region})", file=sys.stderr)
        print(f"Runtime setting {key} was not persisted as expected.", file=sys.stderr)
        print("The deployment will not be accepted with drifted authentication configuration.", file=sys.stderr)
        raise SystemExit(2)

if expected_cloud_sql:
    annotations = (
        payload.get("spec", {})
        .get("template", {})
        .get("metadata", {})
        .get("annotations", {})
    )
    attached = str(annotations.get("run.googleapis.com/cloudsql-instances", ""))
    instances = {part.strip() for part in attached.split(",") if part.strip()}
    if expected_cloud_sql not in instances:
        print("Cloud Run authentication configuration verification failed.", file=sys.stderr)
        print(f"Service: {service_name} (region: {region})", file=sys.stderr)
        print("The expected Cloud SQL instance is not attached to the deployed revision.", file=sys.stderr)
        print("The deployment will not be accepted with incomplete persistence configuration.", file=sys.stderr)
        raise SystemExit(2)

print(f"Verified persisted authentication configuration for Cloud Run service '{service_name}'.")
PY
