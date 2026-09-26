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
    --password=*) printf '%q ' '--password=[REDACTED]' ;;
    *) printf '%q ' "$1" ;;
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
  cat >/dev/null
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

if grep -Eq 'postgres(ql)?://[^[:space:]]+:[^[:space:]]+@' "$tmp/cloud-sql.out" "$log"; then
  fail "generated DATABASE_URL leaked into command output"
fi

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

grep -q "Re-run the Cloud Build trigger" "$tmp/cloud-sql.out" || fail "operator completion guidance absent"

echo "GCP bootstrap behavior validated without exposing credentials."
