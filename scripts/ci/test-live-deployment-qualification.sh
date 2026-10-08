#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "PR62 live deployment qualification contract failure: $*" >&2
  exit 1
}

qualifier="deploy/gcp/qualify-live-deployment.sh"
test -f "$qualifier" || fail "live deployment qualifier missing"
bash -n "$qualifier"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

commit_sha=1234567890abcdef1234567890abcdef12345678
service_url=https://kide-webapp.example.run.app
project_origin=https://kide-webapp-123456789.us-central1.run.app
build_image="us-central1-docker.pkg.dev/test-project/kide/kide-webapp:${commit_sha}"

write_service() {
  local traffic_percent="$1"
  local persisted_commit="$2"
  cat >"$tmp/service.json" <<JSON
{
  "status": {
    "url": "${service_url}",
    "latestReadyRevisionName": "kide-webapp-00042-abc",
    "traffic": [
      {"revisionName": "kide-webapp-00042-abc", "percent": ${traffic_percent}}
    ]
  },
  "spec": {
    "template": {
      "metadata": {
        "annotations": {
          "run.googleapis.com/cloudsql-instances": "test-project:us-central1:kide-web-app"
        }
      },
      "spec": {
        "containers": [
          {
            "env": [
              {"name": "BETTER_AUTH_URL", "value": "${service_url}"},
              {"name": "BETTER_AUTH_TRUSTED_ORIGINS", "value": "${service_url};${project_origin}"},
              {"name": "KIDE_AUTH_DEPLOYMENT_STATE", "value": "configured"},
              {"name": "KIDE_BUILD_COMMIT_SHA", "value": "${persisted_commit}"},
              {"name": "KIDE_BUILD_IMAGE", "value": "${build_image}"}
            ]
          }
        ]
      }
    }
  }
}
JSON
}

cat >"$tmp/revision.json" <<JSON
{
  "spec": {
    "containers": [
      {"image": "us-central1-docker.pkg.dev/test-project/kide/kide-webapp@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
    ]
  },
  "status": {
    "imageDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
JSON

cat >"$tmp/bin/gcloud" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *"run services describe kide-webapp"*)
    cat "${KIDE_FAKE_SERVICE_JSON}"
    ;;
  *"projects describe test-project"*)
    printf '%s\n' '123456789'
    ;;
  *"run revisions describe kide-webapp-00042-abc"*)
    cat "${KIDE_FAKE_REVISION_JSON}"
    ;;
  *)
    echo "unexpected gcloud invocation: $*" >&2
    exit 97
    ;;
esac
FAKE
chmod +x "$tmp/bin/gcloud"

run_qualifier() {
  PATH="$tmp/bin:$PATH" \
  KIDE_FAKE_SERVICE_JSON="$tmp/service.json" \
  KIDE_FAKE_REVISION_JSON="$tmp/revision.json" \
  PROJECT_ID=test-project \
  REGION=us-central1 \
  SERVICE_NAME=kide-webapp \
  CLOUD_SQL_INSTANCE=kide-web-app \
  ARTIFACT_REPOSITORY=kide \
  EXPECTED_COMMIT_SHA="$commit_sha" \
  KIDE_URL="$service_url" \
  OUTPUT_FILE="$tmp/evidence.json" \
  bash "$qualifier"
}

write_service 100 "$commit_sha"
run_qualifier >"$tmp/success.out"
python3 - "$tmp/evidence.json" "$commit_sha" "$service_url" "$build_image" <<'PY'
import json
import sys

path, commit_sha, service_url, build_image = sys.argv[1:]
payload = json.load(open(path, encoding="utf-8"))
assert payload["schemaVersion"] == 1
assert payload["commitSha"] == commit_sha
assert payload["serviceUrl"] == service_url
assert payload["buildImage"] == build_image
assert payload["latestReadyRevision"] == "kide-webapp-00042-abc"
assert payload["trafficPercent"] == 100
assert payload["imageDigest"].startswith("sha256:")
assert payload["authDeploymentState"] == "configured"
assert payload["secretsCaptured"] is False
PY

write_service 90 "$commit_sha"
if run_qualifier >"$tmp/traffic.out" 2>&1; then
  fail "qualifier accepted less than 100% traffic on the latest ready revision"
fi
grep -q "90% traffic instead of 100%" "$tmp/traffic.out" ||
  fail "traffic drift diagnostic missing"

write_service 100 0000000000000000000000000000000000000000
if run_qualifier >"$tmp/commit.out" 2>&1; then
  fail "qualifier accepted a deployed revision for the wrong commit"
fi
grep -q "KIDE_BUILD_COMMIT_SHA was not persisted as expected" "$tmp/commit.out" ||
  fail "commit mismatch diagnostic missing"

write_service 100 "$commit_sha"
if PATH="$tmp/bin:$PATH" \
   KIDE_FAKE_SERVICE_JSON="$tmp/service.json" \
   KIDE_FAKE_REVISION_JSON="$tmp/revision.json" \
   PROJECT_ID=test-project \
   EXPECTED_COMMIT_SHA="$commit_sha" \
   KIDE_URL=https://wrong.example.run.app \
   OUTPUT_FILE="$tmp/wrong-origin.json" \
   bash "$qualifier" >"$tmp/origin.out" 2>&1; then
  fail "qualifier accepted a mismatched production origin"
fi
grep -q "KIDE_URL does not match" "$tmp/origin.out" ||
  fail "production-origin mismatch diagnostic missing"

echo "PR62 live deployment qualification behavior validated."
