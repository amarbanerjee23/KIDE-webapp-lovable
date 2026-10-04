#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "PR60 Cloud Run configuration contract failure: $*" >&2
  exit 1
}

verifier="deploy/gcp/verify-cloud-run-auth-config.sh"
test -f "$verifier" || fail "verifier missing"
bash -n "$verifier"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

write_service() {
  cat > "$tmp/service.json" <<JSON
{
  "status": {"url": "https://kide-webapp.example.run.app"},
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
              {"name": "BETTER_AUTH_URL", "value": "$1"},
              {"name": "BETTER_AUTH_TRUSTED_ORIGINS", "value": "$2"},
              {"name": "KIDE_AUTH_DEPLOYMENT_STATE", "value": "$3"}
            ]
          }
        ]
      }
    }
  }
}
JSON
}

cat > "$tmp/bin/gcloud" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" != *"run services describe kide-webapp"* ]]; then
  echo "unexpected gcloud invocation: $*" >&2
  exit 97
fi
cat "${KIDE_FAKE_SERVICE_JSON}"
FAKE
chmod +x "$tmp/bin/gcloud"

run_verifier() {
  PATH="$tmp/bin:$PATH" \
  KIDE_FAKE_SERVICE_JSON="$tmp/service.json" \
  PROJECT_ID=test-project \
  REGION=us-central1 \
  SERVICE_NAME=kide-webapp \
  EXPECTED_SERVICE_URL=https://kide-webapp.example.run.app \
  EXPECTED_TRUSTED_AUTH_ORIGINS='https://kide-webapp.example.run.app;https://kide-webapp-123456789.us-central1.run.app' \
  EXPECTED_AUTH_DEPLOYMENT_STATE=configured \
  EXPECTED_CLOUD_SQL_CONNECTION=test-project:us-central1:kide-web-app \
  bash "$verifier"
}

expected_origins='https://kide-webapp.example.run.app;https://kide-webapp-123456789.us-central1.run.app'
write_service 'https://kide-webapp.example.run.app' "$expected_origins" configured
run_verifier >"$tmp/success.out"
grep -q "Verified persisted authentication configuration" "$tmp/success.out" ||
  fail "success evidence missing"

write_service 'https://wrong.example.run.app' "$expected_origins" configured
if run_verifier >"$tmp/url-drift.out" 2>&1; then
  fail "verifier accepted drifted BETTER_AUTH_URL"
fi
grep -q "BETTER_AUTH_URL was not persisted as expected" "$tmp/url-drift.out" ||
  fail "BETTER_AUTH_URL drift diagnostic missing"

write_service 'https://kide-webapp.example.run.app' 'https://wrong-origin.example' configured
if run_verifier >"$tmp/origin-drift.out" 2>&1; then
  fail "verifier accepted drifted trusted origins"
fi
grep -q "BETTER_AUTH_TRUSTED_ORIGINS was not persisted as expected" "$tmp/origin-drift.out" ||
  fail "trusted-origin drift diagnostic missing"

write_service 'https://kide-webapp.example.run.app' "$expected_origins" unconfigured
if run_verifier >"$tmp/state-drift.out" 2>&1; then
  fail "verifier accepted drifted auth deployment state"
fi
grep -q "KIDE_AUTH_DEPLOYMENT_STATE was not persisted as expected" "$tmp/state-drift.out" ||
  fail "auth-state drift diagnostic missing"

write_service 'https://kide-webapp.example.run.app' "$expected_origins" configured
python3 - "$tmp/service.json" <<'PY'
from pathlib import Path
import json
import sys
path = Path(sys.argv[1])
payload = json.loads(path.read_text())
payload["spec"]["template"]["metadata"]["annotations"]["run.googleapis.com/cloudsql-instances"] = ""
path.write_text(json.dumps(payload))
PY
if run_verifier >"$tmp/cloudsql-drift.out" 2>&1; then
  fail "verifier accepted missing Cloud SQL attachment"
fi
grep -q "expected Cloud SQL instance is not attached" "$tmp/cloudsql-drift.out" ||
  fail "Cloud SQL drift diagnostic missing"

if grep -R -E 'password|secret-value|api-key' "$tmp"/*.out >/dev/null 2>&1; then
  fail "verification output leaked a secret-like value"
fi

echo "PR60 persisted Cloud Run authentication configuration behavior validated."
