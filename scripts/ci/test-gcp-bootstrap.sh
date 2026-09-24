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
printf '%q ' "$@" >> "${KIDE_FAKE_GCLOUD_LOG}"
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

if [[ "$1 $2 $3" == "secrets versions add" ]]; then
  cat >/dev/null
  exit 0
fi

exit 0
FAKE
chmod +x "$tmp/bin/gcloud"

if PATH="$tmp/bin:$PATH" PROJECT_ID=test-project bash "$script" >"$tmp/missing.out" 2>&1; then
  fail "bootstrap unexpectedly accepted a missing DATABASE_URL"
fi
grep -q "DATABASE_URL is required" "$tmp/missing.out" || fail "missing DATABASE_URL guidance absent"

database_url='postgres://ci-user:super-secret-password@db.example.test:5432/kide?sslmode=require'
PATH="$tmp/bin:$PATH" \
KIDE_FAKE_GCLOUD_LOG="$log" \
PROJECT_ID=test-project \
DATABASE_URL="$database_url" \
RUNTIME_SERVICE_ACCOUNT=runtime@test-project.iam.gserviceaccount.com \
bash "$script" >"$tmp/configured.out"

grep -q "secrets create kide-database-url" "$log" || fail "database secret was not created"
grep -q "secrets create kide-better-auth-secret" "$log" || fail "auth secret was not created"
grep -q "secrets versions add kide-database-url" "$log" || fail "database secret version was not added"
grep -q "secrets versions add kide-better-auth-secret" "$log" || fail "auth secret version was not generated"
grep -q "roles/secretmanager.secretAccessor" "$log" || fail "runtime accessor role was not granted"

if grep -Fq "$database_url" "$tmp/configured.out" || grep -Fq "$database_url" "$log"; then
  fail "DATABASE_URL leaked into command output"
fi

grep -q "Re-run the Cloud Build trigger" "$tmp/configured.out" || fail "operator completion guidance absent"

echo "GCP bootstrap behavior validated without exposing credentials."
