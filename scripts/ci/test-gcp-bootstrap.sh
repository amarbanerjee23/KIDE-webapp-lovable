#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "GCP bootstrap contract failure: $*" >&2
  exit 1
}

script="deploy/gcp/bootstrap-auth-secrets.sh"
test -f "$script" || fail "bootstrap script missing"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
log="$tmp/gcloud.log"

cat > "$tmp/bin/gcloud" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail

log_arg() {
  case "$1" in
    --password=*) printf '%s ' '--password=[REDACTED]' ;;
    *) printf '%s ' "$1" ;;
  esac
}

for arg in "$@"; do
  log_arg "$arg"
done >> "${KIDE_FAKE_GCLOUD_LOG}"
printf '\n' >> "${KIDE_FAKE_GCLOUD_LOG}"

if [[ "$*" == "config get-value project" ]]; then
  echo "test-project"
  exit 0
fi

if [[ "$1 $2" == "secrets describe" ]]; then
  exit 1
fi

if [[ "$1 $2 $3" == "secrets versions describe" ]]; then
  exit 1
fi

if [[ "$1 $2" == "projects describe" ]]; then
  echo "123456789"
  exit 0
fi

if [[ "$1 $2 $3" == "run services describe" ]]; then
  exit 0
fi

if [[ "$1 $2 $3" == "sql instances describe" ]]; then
  echo "test-project:us-central1:kide-web-app"
  exit 0
fi

if [[ "$1 $2 $3" == "sql databases list" ]]; then
  exit 0
fi

if [[ "$1 $2 $3" == "sql users list" ]]; then
  exit 0
fi

if [[ "$1 $2 $3" == "secrets versions add" ]]; then
  if [[ "$*" == *"secrets versions add kide-database-url"* && -n "${KIDE_FAKE_DATABASE_SECRET_PAYLOAD:-}" ]]; then
    cat > "${KIDE_FAKE_DATABASE_SECRET_PAYLOAD}"
  else
    cat >/dev/null
  fi
  exit 0
fi

exit 0
FAKE
chmod +x "$tmp/bin/gcloud"

: > "$log"
if PATH="$tmp/bin:$PATH" \
   KIDE_FAKE_GCLOUD_LOG="$log" \
   PROJECT_ID=test-project \
   CLOUD_SQL_INSTANCE='' \
   bash "$script" >"$tmp/missing.out" 2>&1; then
  fail "bootstrap unexpectedly accepted neither Cloud SQL nor DATABASE_URL"
fi
grep -q "DATABASE_URL is required when CLOUD_SQL_INSTANCE is empty" "$tmp/missing.out" ||
  fail "missing external PostgreSQL guidance absent"

: > "$log"
PATH="$tmp/bin:$PATH" \
KIDE_FAKE_GCLOUD_LOG="$log" \
PROJECT_ID=test-project \
RUNTIME_SERVICE_ACCOUNT=runtime@test-project.iam.gserviceaccount.com \
KIDE_BOOTSTRAP_CONTEXT=cloud-build \
bash "$script" >"$tmp/cloud-sql.out"

grep -q "sql instances describe kide-web-app" "$log" || fail "Cloud SQL instance was not validated"
grep -q "sql databases create kide" "$log" || fail "KIDE database was not created"
grep -q "sql users create kide_app" "$log" || fail "dedicated KIDE database user was not created"
grep -q -- "--password=\\[REDACTED\\]" "$log" || fail "database password path was not exercised safely"
grep -q "secrets create kide-database-url" "$log" || fail "database secret was not created"
grep -q "secrets create kide-better-auth-secret" "$log" || fail "auth secret was not created"
grep -q "secrets versions add kide-database-url" "$log" || fail "database secret version was not added"
grep -q "secrets versions add kide-better-auth-secret" "$log" || fail "auth secret version was not generated"
grep -q "roles/secretmanager.secretAccessor" "$log" || fail "runtime secret accessor role was not granted"
grep -q "roles/cloudsql.client" "$log" || fail "runtime Cloud SQL Client role was not granted"
grep -q "Cloud SQL connection: test-project:us-central1:kide-web-app" "$tmp/cloud-sql.out" ||
  fail "Cloud SQL completion evidence absent"
grep -q "Generated a Cloud-SQL-compliant database password." "$tmp/cloud-sql.out" ||
  fail "bootstrap did not generate a Cloud-SQL-compliant fallback password"
grep -q "Cloud Build bootstrap complete; deployment will continue" "$tmp/cloud-sql.out" ||
  fail "Cloud Build completion guidance absent"
! grep -q "Re-run the Cloud Build trigger" "$tmp/cloud-sql.out" ||
  fail "Cloud Build mode must not ask the operator to rerun the build"

if grep -Eq 'postgres(ql)?://[^[:space:]]+:[^[:space:]]+@' "$tmp/cloud-sql.out" "$log"; then
  fail "generated DATABASE_URL leaked into command output"
fi

: > "$log"
password_payload="$tmp/operator-password-url"
PATH="$tmp/bin:$PATH" \
KIDE_FAKE_GCLOUD_LOG="$log" \
KIDE_FAKE_DATABASE_SECRET_PAYLOAD="$password_payload" \
PROJECT_ID=test-project \
RUNTIME_SERVICE_ACCOUNT=runtime@test-project.iam.gserviceaccount.com \
DATABASE_PASSWORD='Operator@1234' \
bash "$script" >"$tmp/operator-password.out"

grep -q "Using the operator-managed database password supplied through the environment." "$tmp/operator-password.out" ||
  fail "operator-managed database password was not used"
grep -Fq 'Operator%401234' "$password_payload" ||
  fail "database password was not URL-encoded before DATABASE_URL storage"
if grep -Fq 'Operator@1234' "$tmp/operator-password.out" "$log"; then
  fail "operator-managed database password leaked into output"
fi

: > "$log"
if PATH="$tmp/bin:$PATH" \
   KIDE_FAKE_GCLOUD_LOG="$log" \
   PROJECT_ID=test-project \
   RUNTIME_SERVICE_ACCOUNT=runtime@test-project.iam.gserviceaccount.com \
   DATABASE_PASSWORD='weakpassword' \
   bash "$script" >"$tmp/weak-password.out" 2>&1; then
  fail "bootstrap accepted a database password that violates Cloud SQL policy"
fi
grep -q "does not satisfy the Cloud SQL password policy" "$tmp/weak-password.out" ||
  fail "weak password guidance absent"

: > "$log"
database_url='postgres://ci-user:super-secret-password@db.example.test:5432/kide?sslmode=require'
PATH="$tmp/bin:$PATH" \
KIDE_FAKE_GCLOUD_LOG="$log" \
PROJECT_ID=test-project \
CLOUD_SQL_INSTANCE='' \
DATABASE_URL="$database_url" \
RUNTIME_SERVICE_ACCOUNT=runtime@test-project.iam.gserviceaccount.com \
bash "$script" >"$tmp/external.out"

grep -q "secrets versions add kide-database-url" "$log" || fail "external database secret was not stored"
if grep -Fq "$database_url" "$tmp/external.out" || grep -Fq "$database_url" "$log"; then
  fail "supplied DATABASE_URL leaked into command output"
fi

grep -q "Re-run the Cloud Build trigger" "$tmp/external.out" || fail "operator completion guidance absent"

echo "GCP bootstrap behavior validated without exposing credentials."
