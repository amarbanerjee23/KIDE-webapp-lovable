#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "PR64 production deployment safety failure: $*" >&2
  exit 1
}

workflow=".github/workflows/deploy-production.yml"
auth="scripts/release/validate-deploy-authorization.mjs"
test -s "$workflow" || fail "production deploy workflow is missing"
test -s "$auth" || fail "deployment authorization validator is missing"

grep -q '^name: Deploy production from approved main$' "$workflow" ||
  fail "manual production deploy workflow identity drift"
grep -q '^  workflow_dispatch:$' "$workflow" ||
  fail "production deployment must be manually dispatched"
! grep -Eq '^  (push|pull_request|schedule):' "$workflow" ||
  fail "production deployment must not run automatically"
grep -q 'environment: production' "$workflow" ||
  fail "production deployment must use protected GitHub environment"
grep -q 'id-token: write' "$workflow" ||
  fail "production deployment must authenticate using short-lived credentials"
grep -q 'google-github-actions/auth@v3' "$workflow" ||
  fail "production deployment must use Workload Identity Federation"
grep -q 'GCP_WORKLOAD_IDENTITY_PROVIDER' "$workflow" ||
  fail "production workload identity provider is not required"
grep -q 'GCP_PRODUCTION_SERVICE_ACCOUNT' "$workflow" ||
  fail "production service identity is not required"
grep -q 'validate-deploy-authorization.mjs' "$workflow" ||
  fail "production deployment must validate exact main CI"
grep -q 'gcloud builds submit' "$workflow" ||
  fail "production rollout must use canonical Cloud Build"
grep -Fq 'COMMIT_SHA=$GITHUB_SHA' "$workflow" ||
  fail "Cloud Build must receive exact source commit built-in"
grep -Fq '_REQUIRE_AUTH=true' "$workflow" ||
  fail "production deployment must require auth"
grep -Fq '_BOOTSTRAP_CLOUD_SQL=true' "$workflow" ||
  fail "production deployment must require Cloud SQL bootstrap"
grep -q 'qualify-live-deployment.sh' "$workflow" ||
  fail "production deployment must verify revision provenance"
grep -Fq 'verified-production-deploy-' "$workflow" ||
  fail "deployment evidence artifact is required"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sha="$(git rev-parse HEAD)"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "test checkout must have full SHA"

cat >"$tmp/good.json" <<JSON
{"workflow_runs":[
  {"name":"CI","head_branch":"main","head_sha":"$sha","event":"push","status":"completed","conclusion":"success"},
  {"name":"CI","head_branch":"feature","head_sha":"$sha","event":"pull_request","status":"completed","conclusion":"success"}
]}
JSON
cat >"$tmp/pr-only.json" <<JSON
{"workflow_runs":[
  {"name":"CI","head_branch":"feature","head_sha":"$sha","event":"pull_request","status":"completed","conclusion":"success"}
]}
JSON
cat >"$tmp/failed.json" <<JSON
{"workflow_runs":[
  {"name":"CI","head_branch":"main","head_sha":"$sha","event":"push","status":"completed","conclusion":"failure"}
]}
JSON

test_authorize() {
  env GITHUB_REF="${TEST_REF:-refs/heads/main}" \
    GITHUB_SHA="${TEST_HEAD_SHA:-$sha}" \
    CURRENT_MAIN_SHA="${TEST_MAIN_SHA:-$sha}" \
    EXPECTED_COMMIT_SHA="${TEST_EXPECTED_SHA:-$sha}" \
    DEPLOY_CONFIRMATION="${TEST_CONFIRMATION:-DEPLOY $sha}" \
    node "$auth" "$1"
}

test_authorize "$tmp/good.json" >"$tmp/ok.out" ||
  fail "valid authorization should pass"

if TEST_REF=refs/heads/release/pr64 test_authorize "$tmp/good.json" >"$tmp/out" 2>&1; then
  fail "feature branch was accepted"
fi
if TEST_EXPECTED_SHA=0000000000000000000000000000000000000000 test_authorize "$tmp/good.json" >"$tmp/out" 2>&1; then
  fail "stale expected commit was accepted"
fi
if TEST_MAIN_SHA=0000000000000000000000000000000000000000 test_authorize "$tmp/good.json" >"$tmp/out" 2>&1; then
  fail "stale main commit was accepted"
fi
if TEST_CONFIRMATION='DEPLOY wrong' test_authorize "$tmp/good.json" >"$tmp/out" 2>&1; then
  fail "invalid operator confirmation was accepted"
fi
if test_authorize "$tmp/pr-only.json" >"$tmp/out" 2>&1; then
  fail "PR-only CI was accepted as post-merge main CI"
fi
if test_authorize "$tmp/failed.json" >"$tmp/out" 2>&1; then
  fail "failed main CI was accepted"
fi

echo "PR64 exact-main production deployment authorization validated."
