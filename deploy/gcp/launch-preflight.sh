#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-kide-webapp}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-kide-web-app}"
DATABASE_SECRET="${DATABASE_SECRET:-kide-database-url}"
AUTH_SECRET="${AUTH_SECRET:-kide-better-auth-secret}"

fail() {
  echo "LAUNCH PREFLIGHT FAILED: $*" >&2
  exit 1
}

[[ -n "${PROJECT_ID}" && "${PROJECT_ID}" != "(unset)" ]] || fail "PROJECT_ID is not configured."

echo "Checking Cloud Run service..."
SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}"   --project="${PROJECT_ID}"   --region="${REGION}"   --format='value(status.url)')" || fail "Cloud Run service is unavailable."
[[ -n "${SERVICE_URL}" ]] || fail "Cloud Run service has no URL."

echo "Checking runtime service account..."
RUNTIME_SERVICE_ACCOUNT="$(gcloud run services describe "${SERVICE_NAME}"   --project="${PROJECT_ID}"   --region="${REGION}"   --format='value(spec.template.spec.serviceAccountName)')"
[[ -n "${RUNTIME_SERVICE_ACCOUNT}" ]] || fail "Cloud Run runtime service account is not configured."

echo "Checking required secret versions..."
for secret in "${DATABASE_SECRET}" "${AUTH_SECRET}"; do
  gcloud secrets versions describe latest     --project="${PROJECT_ID}"     --secret="${secret}"     --format='value(name)' >/dev/null || fail "Secret ${secret}:latest is missing."
done

echo "Checking Cloud SQL production protection..."
SQL_JSON="$(gcloud sql instances describe "${CLOUD_SQL_INSTANCE}"   --project="${PROJECT_ID}"   --format=json)" || fail "Cloud SQL instance is unavailable."
python3 - "${SQL_JSON}" <<'PY'
import json
import sys

data = json.loads(sys.argv[1])
settings = data.get("settings", {})
backup = settings.get("backupConfiguration", {})
if not backup.get("enabled"):
    raise SystemExit("LAUNCH PREFLIGHT FAILED: Cloud SQL automated backups are disabled.")
if not backup.get("pointInTimeRecoveryEnabled"):
    raise SystemExit("LAUNCH PREFLIGHT FAILED: Cloud SQL point-in-time recovery is disabled.")
print("Cloud SQL automated backups and PITR are enabled.")
PY

echo "Checking public application and auth readiness..."
curl --fail --silent --show-error --max-time 15 "${SERVICE_URL}/" >/dev/null   || fail "Landing page is not reachable."
HEALTH="$(curl --fail --silent --show-error --max-time 15 "${SERVICE_URL}/api/auth/health")"   || fail "Authentication health endpoint is not healthy."
printf '%s' "${HEALTH}" | grep -Eq '"operational"[[:space:]]*:[[:space:]]*true'   || fail "Authentication runtime is not operational."

echo "Checking production auth URL/origin configuration..."
AUTH_URL="$(gcloud run services describe "${SERVICE_NAME}"   --project="${PROJECT_ID}"   --region="${REGION}"   --format='value(spec.template.spec.containers[0].env[?name==`BETTER_AUTH_URL`].value)')"
[[ "${AUTH_URL}" == "${SERVICE_URL}" ]] || fail "BETTER_AUTH_URL does not match the deployed service URL."

echo
echo "Launch preflight passed."
echo "Service: ${SERVICE_URL}"
echo "Runtime identity: ${RUNTIME_SERVICE_ACCOUNT}"
