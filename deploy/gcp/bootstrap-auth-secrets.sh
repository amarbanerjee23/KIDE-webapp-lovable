#!/usr/bin/env bash
set -euo pipefail

# Bootstrap KIDE authentication secrets for Google Cloud Run.
#
# Usage:
#   PROJECT_ID=my-gcp-project \
#   DATABASE_URL='postgres://user:password@host:5432/kide?sslmode=require' \
#   bash deploy/gcp/bootstrap-auth-secrets.sh
#
# Optional:
#   RUNTIME_SERVICE_ACCOUNT=service-account@project.iam.gserviceaccount.com
#   DATABASE_SECRET=kide-database-url
#   AUTH_SECRET=kide-better-auth-secret

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
DATABASE_SECRET="${DATABASE_SECRET:-kide-database-url}"
AUTH_SECRET="${AUTH_SECRET:-kide-better-auth-secret}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "ERROR: Set PROJECT_ID or configure a gcloud project." >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required." >&2
  echo "Pass the PostgreSQL connection string through the DATABASE_URL environment variable." >&2
  exit 2
fi

echo "Enabling Secret Manager API in ${PROJECT_ID}..."
gcloud services enable secretmanager.googleapis.com --project="${PROJECT_ID}"

ensure_secret() {
  local name="$1"
  if ! gcloud secrets describe "${name}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "${name}" \
      --project="${PROJECT_ID}" \
      --replication-policy=automatic >/dev/null
    echo "Created secret ${name}."
  fi
}

ensure_secret "${DATABASE_SECRET}"
ensure_secret "${AUTH_SECRET}"

printf '%s' "${DATABASE_URL}" | gcloud secrets versions add "${DATABASE_SECRET}" \
  --project="${PROJECT_ID}" \
  --data-file=- >/dev/null
echo "Added a new ${DATABASE_SECRET} version."

if ! gcloud secrets versions describe latest \
  --project="${PROJECT_ID}" \
  --secret="${AUTH_SECRET}" >/dev/null 2>&1; then
  AUTH_VALUE="$(openssl rand -base64 48 | tr -d '\n')"
  printf '%s' "${AUTH_VALUE}" | gcloud secrets versions add "${AUTH_SECRET}" \
    --project="${PROJECT_ID}" \
    --data-file=- >/dev/null
  unset AUTH_VALUE
  echo "Generated the initial Better Auth secret."
else
  echo "Keeping the existing Better Auth secret."
fi

if [[ -z "${RUNTIME_SERVICE_ACCOUNT:-}" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
  RUNTIME_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

for secret in "${DATABASE_SECRET}" "${AUTH_SECRET}"; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
done

echo
echo "KIDE authentication secrets are configured."
echo "Runtime service account: ${RUNTIME_SERVICE_ACCOUNT}"
echo "Re-run the Cloud Build trigger; the next revision will enable Better Auth."
