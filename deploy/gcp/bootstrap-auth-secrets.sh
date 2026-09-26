#!/usr/bin/env bash
set -euo pipefail

# Bootstrap KIDE authentication persistence for Google Cloud Run.
#
# Existing Cloud SQL path (default for the hosted KIDE deployment):
#   PROJECT_ID=my-gcp-project bash deploy/gcp/bootstrap-auth-secrets.sh
#
# External PostgreSQL path:
#   PROJECT_ID=my-gcp-project \
#   CLOUD_SQL_INSTANCE='' \
#   DATABASE_URL='postgres://user:password@host:5432/kide?sslmode=require' \
#   bash deploy/gcp/bootstrap-auth-secrets.sh
#
# Optional overrides:
#   SERVICE_NAME=kide-webapp
#   RUNTIME_SERVICE_ACCOUNT=service-account@project.iam.gserviceaccount.com
#   CLOUD_SQL_INSTANCE=kide-web-app
#   CLOUD_SQL_REGION=us-central1
#   DATABASE_NAME=kide
#   DATABASE_USER=kide_app
#   DATABASE_SECRET=kide-database-url
#   AUTH_SECRET=kide-better-auth-secret

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
SERVICE_NAME="${SERVICE_NAME:-kide-webapp}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE-kide-web-app}"
CLOUD_SQL_REGION="${CLOUD_SQL_REGION:-us-central1}"
DATABASE_NAME="${DATABASE_NAME:-kide}"
DATABASE_USER="${DATABASE_USER:-kide_app}"
DATABASE_SECRET="${DATABASE_SECRET:-kide-database-url}"
AUTH_SECRET="${AUTH_SECRET:-kide-better-auth-secret}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "ERROR: Set PROJECT_ID or configure a gcloud project." >&2
  exit 2
fi

echo "Enabling required GCP APIs in ${PROJECT_ID}..."
gcloud services enable secretmanager.googleapis.com sqladmin.googleapis.com run.googleapis.com \
  --project="${PROJECT_ID}" >/dev/null

secret_exists() {
  gcloud secrets describe "$1" --project="${PROJECT_ID}" >/dev/null 2>&1
}

secret_version_exists() {
  gcloud secrets versions describe latest \
    --project="${PROJECT_ID}" \
    --secret="$1" \
    --format='value(name)' >/dev/null 2>&1
}

ensure_secret() {
  local name="$1"
  if ! secret_exists "${name}"; then
    gcloud secrets create "${name}" \
      --project="${PROJECT_ID}" \
      --replication-policy=automatic >/dev/null
    echo "Created secret ${name}."
  fi
}

runtime_service_account() {
  if [[ -n "${RUNTIME_SERVICE_ACCOUNT:-}" ]]; then
    printf '%s' "${RUNTIME_SERVICE_ACCOUNT}"
    return
  fi

  local discovered
  discovered="$(gcloud run services describe "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${CLOUD_SQL_REGION}" \
    --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"

  if [[ -n "${discovered}" ]]; then
    printf '%s' "${discovered}"
    return
  fi

  local project_number
  project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
  printf '%s' "${project_number}-compute@developer.gserviceaccount.com"
}

ensure_secret "${DATABASE_SECRET}"
ensure_secret "${AUTH_SECRET}"

CLOUD_SQL_CONNECTION=""
if [[ -n "${CLOUD_SQL_INSTANCE}" ]]; then
  CLOUD_SQL_CONNECTION="$(gcloud sql instances describe "${CLOUD_SQL_INSTANCE}" \
    --project="${PROJECT_ID}" \
    --format='value(connectionName)')"

  EXPECTED_CONNECTION="${PROJECT_ID}:${CLOUD_SQL_REGION}:${CLOUD_SQL_INSTANCE}"
  if [[ "${CLOUD_SQL_CONNECTION}" != "${EXPECTED_CONNECTION}" ]]; then
    echo "ERROR: Cloud SQL connection mismatch." >&2
    echo "Expected ${EXPECTED_CONNECTION}; got ${CLOUD_SQL_CONNECTION:-<empty>}." >&2
    exit 2
  fi

  echo "Validated Cloud SQL instance ${CLOUD_SQL_CONNECTION}."
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  printf '%s' "${DATABASE_URL}" | gcloud secrets versions add "${DATABASE_SECRET}" \
    --project="${PROJECT_ID}" \
    --data-file=- >/dev/null
  echo "Stored the supplied PostgreSQL connection string in ${DATABASE_SECRET}."
elif secret_version_exists "${DATABASE_SECRET}"; then
  echo "Keeping the existing ${DATABASE_SECRET} version."
elif [[ -n "${CLOUD_SQL_CONNECTION}" ]]; then
  if ! gcloud sql databases list \
      --project="${PROJECT_ID}" \
      --instance="${CLOUD_SQL_INSTANCE}" \
      --format='value(name)' | grep -Fxq "${DATABASE_NAME}"; then
    gcloud sql databases create "${DATABASE_NAME}" \
      --project="${PROJECT_ID}" \
      --instance="${CLOUD_SQL_INSTANCE}" >/dev/null
    echo "Created PostgreSQL database ${DATABASE_NAME}."
  else
    echo "PostgreSQL database ${DATABASE_NAME} already exists."
  fi

  DATABASE_PASSWORD="$(openssl rand -hex 32)"

  if gcloud sql users list \
      --project="${PROJECT_ID}" \
      --instance="${CLOUD_SQL_INSTANCE}" \
      --format='value(name)' | grep -Fxq "${DATABASE_USER}"; then
    gcloud sql users set-password "${DATABASE_USER}" \
      --project="${PROJECT_ID}" \
      --instance="${CLOUD_SQL_INSTANCE}" \
      --password="${DATABASE_PASSWORD}" >/dev/null
    echo "Rotated the dedicated ${DATABASE_USER} database password because no database secret existed."
  else
    gcloud sql users create "${DATABASE_USER}" \
      --project="${PROJECT_ID}" \
      --instance="${CLOUD_SQL_INSTANCE}" \
      --password="${DATABASE_PASSWORD}" >/dev/null
    echo "Created dedicated PostgreSQL user ${DATABASE_USER}."
  fi

  GENERATED_DATABASE_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@localhost:5432/${DATABASE_NAME}"
  printf '%s' "${GENERATED_DATABASE_URL}" | gcloud secrets versions add "${DATABASE_SECRET}" \
    --project="${PROJECT_ID}" \
    --data-file=- >/dev/null

  unset DATABASE_PASSWORD GENERATED_DATABASE_URL
  echo "Generated and stored the Cloud SQL database credential in ${DATABASE_SECRET}."
else
  echo "ERROR: DATABASE_URL is required when CLOUD_SQL_INSTANCE is empty." >&2
  exit 2
fi

if ! secret_version_exists "${AUTH_SECRET}"; then
  AUTH_VALUE="$(openssl rand -base64 48 | tr -d '\n')"
  printf '%s' "${AUTH_VALUE}" | gcloud secrets versions add "${AUTH_SECRET}" \
    --project="${PROJECT_ID}" \
    --data-file=- >/dev/null
  unset AUTH_VALUE
  echo "Generated the initial Better Auth secret."
else
  echo "Keeping the existing Better Auth secret."
fi

RUNTIME_SERVICE_ACCOUNT="$(runtime_service_account)"

for secret in "${DATABASE_SECRET}" "${AUTH_SECRET}"; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
done

if [[ -n "${CLOUD_SQL_CONNECTION}" ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
    --role="roles/cloudsql.client" \
    --quiet >/dev/null
fi

echo
echo "KIDE authentication persistence is configured."
echo "Runtime service account: ${RUNTIME_SERVICE_ACCOUNT}"
if [[ -n "${CLOUD_SQL_CONNECTION}" ]]; then
  echo "Cloud SQL connection: ${CLOUD_SQL_CONNECTION}"
  echo "Cloud Run socket: /cloudsql/${CLOUD_SQL_CONNECTION}"
fi
echo "Database secret: ${DATABASE_SECRET}"
echo "Better Auth secret: ${AUTH_SECRET}"
echo "Re-run the Cloud Build trigger; the next revision will verify /api/auth/health."
