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
test -f 'src/routes/api/auth/$.ts' || fail "auth catch-all route missing"
grep -q '/api/auth/health' 'src/routes/api/auth/$.ts' || fail "auth runtime health endpoint missing"

bash -n deploy/gcp/bootstrap-auth-secrets.sh
docker compose -f compose.yaml config --quiet

grep -q -- '--update-secrets=DATABASE_URL=' cloudbuild.yaml || fail "Cloud Build must use targeted secret updates"
grep -q -- '--remove-secrets=DATABASE_URL,BETTER_AUTH_SECRET' cloudbuild.yaml || fail "Cloud Build must remove only KIDE auth secrets when unavailable"
! grep -q -- '--set-secrets=' cloudbuild.yaml || fail "Cloud Build must not replace unrelated Cloud Run secret bindings"
! grep -q -- '--clear-secrets' cloudbuild.yaml || fail "Cloud Build must not clear unrelated Cloud Run secrets"

grep -q 'secret_version_exists' cloudbuild.yaml || fail "Cloud Build must preflight Secret Manager versions"
grep -q '_REQUIRE_AUTH: "true"' cloudbuild.yaml || fail "Production Cloud Build must require auth by default"
grep -q 'openssl rand -base64 48' cloudbuild.yaml || fail "Cloud Build must generate the Better Auth secret when absent"
grep -q 'roles/secretmanager.secretAccessor' cloudbuild.yaml || fail "Cloud Build must bind runtime secret access"
grep -q '_CLOUD_SQL_INSTANCE: kide-web-app' cloudbuild.yaml || fail "hosted GCP deployment must name the existing Cloud SQL instance"
grep -q 'sqladmin.googleapis.com' cloudbuild.yaml || fail "Cloud Build must enable the Cloud SQL Admin API"
grep -q -- '--add-cloudsql-instances=' cloudbuild.yaml || fail "Cloud Run must attach the configured Cloud SQL instance"
grep -q 'INSTANCE_UNIX_SOCKET=/cloudsql/' cloudbuild.yaml || fail "Cloud Run must receive the Cloud SQL Unix socket path"
grep -q 'roles/cloudsql.client' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must grant Cloud SQL Client to the runtime identity"
grep -q 'gcloud sql instances describe' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must validate the existing Cloud SQL instance"
grep -q 'gcloud sql databases create' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must provision the KIDE database when absent"
grep -q 'gcloud sql users create' deploy/gcp/bootstrap-auth-secrets.sh || fail "bootstrap must provision a dedicated database user when absent"
! grep -q '34\.41\.0\.217' cloudbuild.yaml deploy/gcp/bootstrap-auth-secrets.sh || fail "deployment must not depend on the Cloud SQL public IP"
grep -Fq 'rm -f "$READY_FILE" "$CLOUD_SQL_FILE"' cloudbuild.yaml || fail "Cloud Build runtime file variables must use $ escaping"
grep -Fq 'CLOUD_SQL_CONNECTION="$(cat /workspace/.kide-cloud-sql-connection)"' cloudbuild.yaml || fail "Cloud SQL runtime connection variable must use $ escaping"
grep -Fq '"--add-cloudsql-instances=$CLOUD_SQL_CONNECTION"' cloudbuild.yaml || fail "Cloud SQL deploy arg must preserve the runtime variable"
grep -Fq 'INSTANCE_UNIX_SOCKET=/cloudsql/$CLOUD_SQL_CONNECTION' cloudbuild.yaml || fail "Cloud SQL socket env must preserve the runtime variable"
grep -q '/api/auth/health' cloudbuild.yaml || fail "Cloud Build must verify live Better Auth health"
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
