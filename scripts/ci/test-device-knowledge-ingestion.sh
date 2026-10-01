#!/usr/bin/env bash
set -euo pipefail

password="ci-ingestion-knowledge-password"
export KIDE_ARCADEDB_PASSWORD="$password"

cleanup() {
  docker compose -f compose.knowledge-python.yaml down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker compose -f compose.knowledge-python.yaml up -d --build

ready=0
for _ in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:8090/health >/tmp/kide-ingestion-health.json &&
    grep -q '"arcadeDbReady":true' /tmp/kide-ingestion-health.json; then
    ready=1
    break
  fi
  sleep 2
done
[[ "$ready" == "1" ]] || {
  echo "Semantic knowledge service did not become ready." >&2
  docker compose -f compose.knowledge-python.yaml logs --no-color || true
  exit 1
}

cat >/tmp/kide-trusted-device.json <<'JSON'
{
  "source": {
    "uri": "https://manufacturer.example/devices/r1",
    "publisher": "Example Robotics",
    "license": "CC-BY-4.0",
    "retrievedAt": "2026-10-01T00:00:00Z",
    "sourceType": "manufacturer",
    "version": "1.0"
  },
  "device": {
    "manufacturer": "Example Robotics",
    "model": "R1",
    "label": "Example R1",
    "properties": {"datasheetRevision":"A"},
    "capabilities": [{
      "id": "move",
      "label": "Move",
      "interface": "Motion",
      "behavior": "Translate",
      "context": "IndoorCell",
      "preconditions": ["Ready"],
      "postconditions": ["Moved"]
    }]
  },
  "confidence": 0.95
}
JSON

curl --fail-with-body --silent   -H 'content-type: application/json'   --data-binary @/tmp/kide-trusted-device.json   http://127.0.0.1:8090/v1/ingestion/preview >/tmp/kide-preview.json
grep -q '"status":"accepted"' /tmp/kide-preview.json
grep -q '"prov:hadPrimarySource":"https://manufacturer.example/devices/r1"' /tmp/kide-preview.json
grep -q '"sourceLicense":"CC-BY-4.0"' /tmp/kide-preview.json

before="$(curl --fail-with-body --silent http://127.0.0.1:8090/v1/devices)"
if printf '%s' "$before" | grep -q 'urn:kide:device:example-robotics:r1'; then
  echo "Preview unexpectedly persisted device knowledge." >&2
  exit 1
fi

curl --fail-with-body --silent   -H 'content-type: application/json'   --data-binary @/tmp/kide-trusted-device.json   http://127.0.0.1:8090/v1/ingestion/commit >/tmp/kide-commit.json
grep -q '"nodeCount":7' /tmp/kide-commit.json
grep -q '"edgeCount":6' /tmp/kide-commit.json

curl --fail-with-body --silent http://127.0.0.1:8090/v1/devices >/tmp/kide-ingested-devices.json
grep -q '"semanticId":"urn:kide:device:example-robotics:r1"' /tmp/kide-ingested-devices.json
grep -q '"sourceLicense":"CC-BY-4.0"' /tmp/kide-ingested-devices.json
grep -q '"confidence":0.95' /tmp/kide-ingested-devices.json

curl --fail-with-body --silent   -H 'content-type: application/json'   --data-binary @/tmp/kide-trusted-device.json   http://127.0.0.1:8090/v1/ingestion/commit >/tmp/kide-repeat-commit.json

repeat_count="$(curl --fail-with-body --silent http://127.0.0.1:8090/v1/devices | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
[[ "$repeat_count" == "1" ]] || {
  echo "Repeated ingestion created a duplicate device; expected one, got $repeat_count." >&2
  exit 1
}

python3 - <<'PY'
import json
payload=json.load(open('/tmp/kide-trusted-device.json'))
payload['confidence']=0.2
json.dump(payload,open('/tmp/kide-quarantined-device.json','w'))
PY

status="$(curl --silent --output /tmp/kide-quarantine.json --write-out '%{http_code}'   -H 'content-type: application/json'   --data-binary @/tmp/kide-quarantined-device.json   http://127.0.0.1:8090/v1/ingestion/commit)"
[[ "$status" == "422" ]] || {
  echo "Quarantined knowledge should fail with 422, got $status." >&2
  cat /tmp/kide-quarantine.json
  exit 1
}
grep -qi 'quarantined' /tmp/kide-quarantine.json
grep -q '0.80' /tmp/kide-quarantine.json

count="$(curl --fail-with-body --silent http://127.0.0.1:8090/v1/devices | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
[[ "$count" == "1" ]] || {
  echo "Rejected ingestion mutated graph state; expected one device, got $count." >&2
  exit 1
}

echo "Trusted device ingestion, provenance and quarantine behavior validated."
