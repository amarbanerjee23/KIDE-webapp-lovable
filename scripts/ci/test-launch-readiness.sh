#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Launch-readiness CI failure: $*" >&2
  exit 1
}

bash -n deploy/gcp/launch-preflight.sh
bash -n deploy/gcp/qualify-live-deployment.sh
bash -n scripts/launch/live-smoke.sh

grep -q 'pointInTimeRecoveryEnabled' deploy/gcp/launch-preflight.sh   || fail "launch preflight must enforce Cloud SQL PITR"
grep -q 'backup.get("enabled")' deploy/gcp/launch-preflight.sh   || fail "launch preflight must enforce automated backups"
grep -q '/api/auth/health' deploy/gcp/launch-preflight.sh   || fail "launch preflight must verify auth readiness"
grep -q 'BETTER_AUTH_URL' deploy/gcp/launch-preflight.sh   || fail "launch preflight must verify production auth URL"
grep -q 'EXPECTED_COMMIT_SHA' deploy/gcp/qualify-live-deployment.sh   || fail "live deployment qualification must bind to an exact commit"
grep -q 'trafficPercent' deploy/gcp/qualify-live-deployment.sh   || fail "live deployment qualification must record traffic ownership"
grep -q 'imageDigest' deploy/gcp/qualify-live-deployment.sh   || fail "live deployment qualification must record immutable image digest"
grep -q '/api/auth/sign-up/email' scripts/launch/live-smoke.sh   || fail "live smoke must exercise real signup"
grep -q '/api/auth/get-session' scripts/launch/live-smoke.sh   || fail "live smoke must verify authenticated session"
grep -q '/projects' scripts/launch/live-smoke.sh   || fail "live smoke must cover a protected route"
grep -q 'id="privacy"' src/routes/index.tsx || fail "public privacy surface missing"
grep -q 'id="terms"' src/routes/index.tsx || fail "public terms surface missing"

for doc in   docs/operations/launch-runbook.md   docs/operations/database-backup-restore.md   docs/operations/observability.md; do
  test -s "$doc" || fail "required launch document missing: $doc"
done

grep -q 'KIDE_GRAPH_SYNTHESIS_KILL_SWITCH=1' docs/operations/launch-runbook.md   || fail "launch runbook must document graph synthesis emergency rollback"
grep -q 'point-in-time recovery' docs/operations/database-backup-restore.md   || fail "database runbook must document PITR"
grep -q '/api/auth/health' docs/operations/observability.md   || fail "observability runbook must monitor auth health"

echo "Production launch-readiness contracts passed."
