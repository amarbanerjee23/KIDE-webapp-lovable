#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "CI deployment-contract failure: $*" >&2
  exit 1
}

test -f cloudbuild.yaml || fail "cloudbuild.yaml missing"
test -f Dockerfile || fail "Dockerfile missing"
test -f compose.yaml || fail "compose.yaml missing"
test -f deploy/gcp/bootstrap-auth-secrets.sh || fail "GCP auth bootstrap script missing"
test -f deploy/gcp/verify-cloud-run-auth-config.sh || fail "GCP runtime auth verifier missing"
test -f 'src/routes/api/auth/$.ts' || fail "auth catch-all route missing"
grep -q '/api/auth/health' 'src/routes/api/auth/$.ts' || fail "auth runtime health endpoint missing"

bash -n deploy/gcp/bootstrap-auth-secrets.sh
bash -n deploy/gcp/verify-cloud-run-auth-config.sh
docker compose -f compose.yaml config --quiet

python3 - <<'PY'
from pathlib import Path
import subprocess
import sys

lines = Path("cloudbuild.yaml").read_text().splitlines()
scripts = []
i = 0
while i < len(lines):
    if lines[i] == "      - |":
        i += 1
        block = []
        while i < len(lines) and (lines[i].startswith("        ") or lines[i] == ""):
            line = lines[i]
            block.append(line[8:] if line.startswith("        ") else "")
            i += 1
        scripts.append("\n".join(block).replace(chr(36) * 2, chr(36)))
        continue
    i += 1

if not scripts:
    print("No Cloud Build shell blocks found.", file=sys.stderr)
    raise SystemExit(1)

for index, script in enumerate(scripts, start=1):
    result = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    if result.returncode != 0:
        print(f"Cloud Build shell block {index} has invalid Bash syntax:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        raise SystemExit(result.returncode)

print(f"Validated Bash syntax for {len(scripts)} Cloud Build shell blocks.")
PY

grep -q -- '--update-secrets=DATABASE_URL=' cloudbuild.yaml || fail "Cloud Build must use targeted secret updates"
grep -q -- '--remove-secrets=DATABASE_URL,BETTER_AUTH_SECRET' cloudbuild.yaml || fail "Cloud Build must remove only KIDE auth secrets when unavailable"
! grep -q -- '--set-secrets=' cloudbuild.yaml || fail "Cloud Build must not replace unrelated Cloud Run secret bindings"
! grep -q -- '--clear-secrets' cloudbuild.yaml || fail "Cloud Build must not clear unrelated Cloud Run secrets"

grep -q 'secret_version_exists' cloudbuild.yaml || fail "Cloud Build must preflight Secret Manager versions"
grep -q '_REQUIRE_AUTH: "true"' cloudbuild.yaml || fail "Production Cloud Build must require auth by default"
grep -q 'openssl rand -base64 48' cloudbuild.yaml || fail "Cloud Build must generate the Better Auth secret when absent"
grep -q 'roles/secretmanager.secretAccessor' cloudbuild.yaml || fail "Cloud Build must bind runtime secret access"
grep -q '_CLOUD_SQL_INSTANCE: kide-web-app' cloudbuild.yaml || fail "hosted GCP deployment must name the existing Cloud SQL instance"
grep -q '_BOOTSTRAP_CLOUD_SQL: "true"' cloudbuild.yaml || fail "hosted Cloud Build must bootstrap Cloud SQL by default"
grep -q '_DATABASE_PASSWORD_SECRET: kide-database-password' cloudbuild.yaml || fail "Cloud Build must support operator-managed database password secret"
grep -q 'secrets versions access latest' cloudbuild.yaml || fail "Cloud Build must read the operator-managed database password from Secret Manager"
grep -q 'Generated a Cloud-SQL-compliant database password' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must generate a Cloud-SQL-compliant fallback password"
grep -q 'DATABASE_PASSWORD does not satisfy the Cloud SQL password policy' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must reject noncompliant database passwords"
grep -q 'ENCODED_DATABASE_PASSWORD' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must URL-encode special characters in database passwords"
grep -q 'id: bootstrap-auth-persistence' cloudbuild.yaml || fail "Cloud Build bootstrap step missing"
grep -q 'KIDE_BOOTSTRAP_CONTEXT=cloud-build' cloudbuild.yaml || fail "Cloud Build must invoke bootstrap in cloud-build mode"
grep -q 'bash deploy/gcp/bootstrap-auth-secrets.sh' cloudbuild.yaml || fail "Cloud Build must invoke the shared bootstrap script"
grep -q 'Cloud SQL bootstrap disabled; expecting PostgreSQL and runtime IAM to be managed externally' cloudbuild.yaml || fail "Cloud Build must expose an external-PostgreSQL opt-out"
grep -q 'sqladmin.googleapis.com' cloudbuild.yaml || fail "Cloud Build must enable the Cloud SQL Admin API"
grep -q -- '--add-cloudsql-instances=' cloudbuild.yaml || fail "Cloud Run must attach the configured Cloud SQL instance"
grep -q 'INSTANCE_UNIX_SOCKET=/cloudsql/' cloudbuild.yaml || fail "Cloud Run must receive the Cloud SQL Unix socket path"
grep -q 'roles/cloudsql.client' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must grant Cloud SQL Client to the runtime identity"
grep -Fq -- '--condition=None' deploy/gcp/bootstrap-auth-secrets.sh || fail "Cloud SQL Client project IAM grant must be explicitly unconditional"
grep -q 'gcloud sql instances describe' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must validate the existing Cloud SQL instance"
grep -q 'gcloud sql databases create' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must provision the KIDE database when absent"
grep -q 'gcloud sql users create' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must provision a dedicated database user when absent"
! grep -q '34\.41\.0\.217' cloudbuild.yaml deploy/gcp/bootstrap-auth-secrets.sh || fail "deployment must not depend on the Cloud SQL public IP"
grep -Fq 'rm -f "$$READY_FILE" "$$CLOUD_SQL_FILE"' cloudbuild.yaml || fail "Cloud Build runtime file variables must use double-dollar escaping"
grep -Fq 'runtime_service_account=""' cloudbuild.yaml || fail "Cloud Build preflight must initialize the runtime service-account variable under set -u"
grep -Fq 'discovered_runtime_service_account="$$(gcloud run services describe' cloudbuild.yaml || fail "Cloud Build preflight must discover the runtime service account safely"
grep -Fq '2>/dev/null || true)"' cloudbuild.yaml || fail "Cloud Run service-account discovery command substitution must be properly quoted"
grep -Fq 'project_number="$$(gcloud projects describe' cloudbuild.yaml || fail "Cloud Build preflight must fall back to the project default runtime identity"
grep -Fq "ERROR: Could not determine the Cloud Run runtime service account." cloudbuild.yaml || fail "Cloud Build preflight must fail clearly when runtime identity discovery fails"
grep -Fq 'CLOUD_SQL_CONNECTION="$$(cat /workspace/.kide-cloud-sql-connection)"' cloudbuild.yaml || fail "Cloud SQL runtime connection variable must use double-dollar escaping"
grep -Fq '"--add-cloudsql-instances=$$CLOUD_SQL_CONNECTION"' cloudbuild.yaml || fail "Cloud SQL deploy arg must preserve the runtime variable"
grep -Fq 'INSTANCE_UNIX_SOCKET=/cloudsql/$$CLOUD_SQL_CONNECTION' cloudbuild.yaml || fail "Cloud SQL socket env must preserve the runtime variable"
grep -q 'verify-cloud-run-auth-config.sh' cloudbuild.yaml || fail "Cloud Build must verify persisted runtime auth configuration"
grep -q 'EXPECTED_TRUSTED_AUTH_ORIGINS=' cloudbuild.yaml || fail "Cloud Build must pass the intended trusted-origin contract to the verifier"
grep -q 'EXPECTED_AUTH_DEPLOYMENT_STATE=' cloudbuild.yaml || fail "Cloud Build must verify the intended auth deployment state"
grep -q 'EXPECTED_CLOUD_SQL_CONNECTION=' cloudbuild.yaml || fail "Cloud Build must verify the intended Cloud SQL attachment"
grep -q '/api/auth/health' cloudbuild.yaml || fail "Cloud Build must verify live Better Auth health"
grep -Fq 'host: socketPath' src/lib/database.server.ts || fail "postgres.js must receive the Cloud SQL Unix socket directory as host"
! grep -Fq 'path: socketPath' src/lib/database.server.ts || fail "postgres.js must not connect directly to the Cloud SQL socket directory"
grep -q 'verifyApplicationDatabaseConnection' src/lib/auth.server.ts || fail "auth health must verify the application database client"
grep -Fq 'getDatabase().unsafe("SELECT 1")' src/lib/database.server.ts || fail "application database readiness query missing"
grep -q 'trustedOrigins: resolveTrustedAuthOrigins' src/lib/auth.server.ts || fail "Better Auth must use the explicit trusted-origin allowlist"
grep -q 'BETTER_AUTH_TRUSTED_ORIGINS' cloudbuild.yaml || fail "Cloud Build must configure Better Auth trusted origins"
grep -Fq 'PROJECT_RUN_ORIGIN="https://${_SERVICE}-$${PROJECT_NUMBER}.${_REGION}.run.app"' cloudbuild.yaml || fail "Cloud Build must trust the project-number Cloud Run origin"
grep -Fq 'TRUSTED_AUTH_ORIGINS="$$SERVICE_URL;$$PROJECT_RUN_ORIGIN"' cloudbuild.yaml || fail "Cloud Build must trust both approved Cloud Run service origins"
! grep -q 'disableCSRFCheck:[[:space:]]*true' src/lib/auth.server.ts || fail "Better Auth CSRF protection must remain enabled"
! grep -q 'disableOriginCheck:[[:space:]]*true' src/lib/auth.server.ts || fail "Better Auth origin validation must remain enabled"
grep -Fq 'SERVICE_URL="$$(gcloud run services describe' cloudbuild.yaml || fail "Cloud Build must discover the deployed service URL at runtime"
grep -Fq -- '--project="${PROJECT_ID}"' cloudbuild.yaml || fail "Cloud Build runtime service lookups must be project-scoped"
grep -Fq -- "--format='value(status.url)')\"" cloudbuild.yaml || fail "Cloud Build service URL command substitution must be correctly closed"
grep -q 'KIDE_AUTH_DEPLOYMENT_STATE=unconfigured' cloudbuild.yaml || fail "Cloud Build must support explicit auth-unconfigured deployment"
grep -q 'KIDE_AUTH_DEPLOYMENT_STATE=configured' cloudbuild.yaml || fail "Cloud Build must mark configured auth deployments"
grep -q 'The deployment is stopping instead of publishing a revision with nonfunctional sign-in' cloudbuild.yaml ||
  fail "Cloud Build must fail fast instead of silently publishing broken production auth"

runtime_baas_refs="$(git grep -nE '@supabase/supabase-js|integrations/supabase|VITE_SUPABASE_|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_PUBLISHABLE_KEY|@lovable\.dev/cloud-auth-js' -- src Dockerfile cloudbuild.yaml package.json compose.yaml || true)"
if [[ -n "$runtime_baas_refs" ]]; then
  echo "$runtime_baas_refs" >&2
  fail "hosted-BaaS runtime dependency reintroduced"
fi

secret_literals="$(git grep -nEI '(service[_-]?role|api[_-]?key|client[_-]?secret|better_auth_secret)[[:space:]]*[:=][[:space:]]*[A-Za-z0-9+/=_-]{24,}' -- ':!bun.lock' ':!*.md' || true)"
if [[ -n "$secret_literals" ]]; then
  echo "$secret_literals" >&2
  fail "possible literal secret committed"
fi

echo "Deployment and secret-management contracts validated."
