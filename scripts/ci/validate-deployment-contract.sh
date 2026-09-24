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

bash -n deploy/gcp/bootstrap-auth-secrets.sh
docker compose -f compose.yaml config --quiet

grep -q -- '--update-secrets=DATABASE_URL=' cloudbuild.yaml || fail "Cloud Build must use targeted secret updates"
grep -q -- '--remove-secrets=DATABASE_URL,BETTER_AUTH_SECRET' cloudbuild.yaml || fail "Cloud Build must remove only KIDE auth secrets when unavailable"
! grep -q -- '--set-secrets=' cloudbuild.yaml || fail "Cloud Build must not replace unrelated Cloud Run secret bindings"
! grep -q -- '--clear-secrets' cloudbuild.yaml || fail "Cloud Build must not clear unrelated Cloud Run secrets"

grep -q 'secret_version_exists' cloudbuild.yaml || fail "Cloud Build must preflight Secret Manager versions"
grep -q 'KIDE_AUTH_DEPLOYMENT_STATE=unconfigured' cloudbuild.yaml || fail "Cloud Build must support explicit auth-unconfigured deployment"
grep -q 'KIDE_AUTH_DEPLOYMENT_STATE=configured' cloudbuild.yaml || fail "Cloud Build must mark configured auth deployments"

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
