#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Release publication safety failure: $*" >&2
  exit 1
}

workflow=".github/workflows/publish-release.yml"
qualification_workflow=".github/workflows/production-qualification.yml"
operations_workflow=".github/workflows/operations-approval.yml"
test -s "$workflow" || fail "publish-release workflow missing"
test -s "$qualification_workflow" || fail "production qualification workflow missing"
test -s "$operations_workflow" || fail "independent operations approval workflow missing"
node scripts/ci/test-operations-approval.mjs
node scripts/ci/test-protected-deploy-provenance.mjs
bash -n scripts/release/validate-publication.sh

grep -q '^  workflow_dispatch:$' "$workflow" ||
  fail "official release workflow must be manual-only"
! grep -Eq '^  (push|pull_request|schedule):' "$workflow" ||
  fail "official release workflow must not publish from push, PR or schedule"
grep -q 'environment: production' "$workflow" ||
  fail "release publication must use the production environment"
grep -q 'contents: write' "$workflow" ||
  fail "release workflow needs explicit tag/release write permission"
grep -q 'actions: read' "$workflow" ||
  fail "release workflow must be able to verify CI and qualification evidence"
grep -q 'PUBLISH v1.0.0' "$workflow" ||
  fail "release workflow must require explicit publication confirmation"
grep -q 'deployment_run_id' "$workflow" ||
  fail "publication must require the actual protected deployment workflow run"
grep -q 'Require protected exact-main deployment provenance' "$workflow" ||
  fail "publication must compare original protected deployment evidence with live qualification"
grep -q 'verified-production-deploy-' "$workflow" ||
  fail "publisher must retrieve the original commit-scoped protected rollout artifact"
grep -q 'verify-protected-deployment.mjs' "$workflow" ||
  fail "publication must validate the original protected rollout artifact against live evidence"
grep -q 'Protected deployment artifact SHA-256' "$workflow" ||
  fail "release notes must retain the protected rollout artifact digest"
grep -q 'operations_approval_run_id' "$workflow" ||
  fail "publication must require the independent operations approval run"
grep -q 'Require independent reviewed operations approval' "$workflow" ||
  fail "publication must validate separately reviewed release operations evidence"
grep -q '/approvals' "$workflow" ||
  fail "publication must require GitHub's protected environment review events"
grep -q 'verify-operations-approval.mjs' "$workflow" ||
  fail "publication must validate immutable operations attestation"
grep -q 'Operations approval evidence SHA-256' "$workflow" ||
  fail "publication must retain sign-off artifact digest"
grep -q 'qualification_run_id' "$workflow" ||
  fail "release workflow must require a production qualification run ID"
grep -q 'Production deployment qualification' "$workflow" ||
  fail "release workflow must verify the qualification workflow identity"
grep -q 'gh run download' "$workflow" ||
  fail "release workflow must download acceptance evidence from the qualification run"
grep -q 'production-qualification-' "$workflow" ||
  fail "release workflow must require the exact commit-scoped qualification artifact"
! grep -q 'acceptance_evidence_json' "$workflow" ||
  fail "release workflow must not trust operator-pasted acceptance JSON"
grep -q 'Require successful main CI for accepted commit' "$workflow" ||
  fail "release workflow must verify successful main CI"
grep -q 'git ls-remote --exit-code --tags' "$workflow" ||
  fail "release workflow must refuse an existing tag"
grep -q 'require-current-main.mjs' "$workflow" ||
  fail "publication must check fresh main SHA immediately before creating the release"
grep -q 'git fetch --no-tags origin main' "$workflow" ||
  fail "publisher must refetch the remote main tip before release"
grep -q 'gh release create' "$workflow" ||
  fail "release workflow must publish through GitHub Releases"
grep -q 'KIDE_QUALIFICATION_ACCEPTANCE_PATH' "$workflow" ||
  fail "publisher must retain original downloaded sidecars with acceptance JSON"
grep -q 'Launch acceptance evidence SHA-256' "$workflow" ||
  fail "release notes must retain an acceptance evidence digest"

grep -q '^name: Production deployment qualification$' "$qualification_workflow" ||
  fail "production qualification workflow must have a stable identity"
grep -q 'id-token: write' "$qualification_workflow" ||
  fail "production qualification must use short-lived GCP workload identity"
grep -q 'google-github-actions/auth@v3' "$qualification_workflow" ||
  fail "production qualification must authenticate through the GCP auth action"
grep -q 'GCP_WORKLOAD_IDENTITY_PROVIDER' "$qualification_workflow" ||
  fail "production qualification must require workload identity configuration"
grep -q 'GCP_PRODUCTION_SERVICE_ACCOUNT' "$qualification_workflow" ||
  fail "production qualification must use a dedicated production service account"
grep -q 'GITHUB_REF.*refs/heads/main' "$qualification_workflow" ||
  fail "production qualification must refuse non-main dispatches"
grep -q 'capture-acceptance.sh' "$qualification_workflow" ||
  fail "production qualification must capture launch acceptance evidence"
grep -q 'retention-days: 90' "$qualification_workflow" ||
  fail "production qualification evidence must be retained for release operations"

grep -q '^  workflow_dispatch:$' "$operations_workflow" ||
  fail "independent operations approval must be manual-only"
! grep -Eq '^  (push|pull_request|schedule):' "$operations_workflow" ||
  fail "sign-off cannot be automatic"
grep -q 'environment: production-release-approval' "$operations_workflow" ||
  fail "sign-off must use a dedicated approval environment"
grep -q 'actions: read' "$operations_workflow" ||
  fail "operations approval must verify a real successful production qualification"
grep -q 'restore_sql_inspection_url' "$operations_workflow" ||
  fail "operations approval must reference recovered SQL integrity"
grep -q 'clone_source_audit_url' "$operations_workflow" ||
  fail "operations approval must reference clone source provenance"
grep -q 'monitoring_rollback_url' "$operations_workflow" ||
  fail "operations approval must reference owner, alerts and rollback evidence"
grep -q 'privacy_terms_approval_url' "$operations_workflow" ||
  fail "operations approval must reference legal/business sign-off"
grep -q 'incident_review_url' "$operations_workflow" ||
  fail "operations approval must reference launch incident review"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sha="$(git rev-parse HEAD)"

cat >"$tmp/good.json" <<JSON
{
  "acceptedAt": "2026-10-08T00:00:00Z",
  "branch": "main",
  "checks": {
    "gcpLaunchPreflight": {
      "outputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "status": "passed"
    },
    "liveSmoke": {
      "outputSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "status": "passed"
    },
    "productionBrowserJourney": {
      "outputSha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "status": "passed"
    },
    "deploymentQualification": {
      "outputSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "status": "passed"
    }
  },
  "commitSha": "$sha",
  "deployment": {
    "schemaVersion": 1,
    "qualifiedAt": "2026-10-08T00:00:00Z",
    "projectId": "test-project",
    "region": "us-central1",
    "serviceName": "kide-webapp",
    "serviceUrl": "https://kide.example.test",
    "commitSha": "$sha",
    "buildImage": "us-central1-docker.pkg.dev/test-project/kide/kide-webapp:$sha",
    "latestReadyRevision": "kide-webapp-00042-abc",
    "revisionImage": "us-central1-docker.pkg.dev/test-project/kide/kide-webapp@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "imageDigest": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "registryImageDigest": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "cloudSqlConnection": "test-project:us-central1:kide-web-app",
    "authDeploymentState": "configured",
    "trafficPercent": 100,
    "secretsCaptured": false
  },
  "operator": "ci",
  "productionOrigin": "https://kide.example.test",
  "releaseVersion": "1.0.0",
  "restoreDrillReference": "restore-drill-ci",
  "schemaVersion": 2,
  "secretsCaptured": false
}
JSON

node scripts/ci/write-acceptance-fixture.mjs "$tmp/good.json"
ACCEPTANCE_FILE="$tmp/good.json" EXPECTED_COMMIT_SHA="$sha"   bash scripts/release/validate-publication.sh >/dev/null

node - "$tmp/good.json" "$tmp/bad.json" <<'JS'
const fs = require("fs");
const [source, target] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(source, "utf8"));
payload.commitSha = "0000000000000000000000000000000000000000";
fs.writeFileSync(target, JSON.stringify(payload));
JS

if ACCEPTANCE_FILE="$tmp/bad.json" EXPECTED_COMMIT_SHA="$sha"    bash scripts/release/validate-publication.sh >/dev/null 2>&1; then
  fail "publication validator accepted evidence for the wrong commit"
fi

echo "Guarded official release publication contracts passed."
