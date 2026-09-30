#!/usr/bin/env bash
set -euo pipefail

password="ci-arcadedb-knowledge-password"
export KIDE_ARCADEDB_PASSWORD="$password"

cleanup() {
  docker compose -f compose.knowledge-python.yaml down -v --remove-orphans >/dev/null 2>&1 || true
}
cleanup

docker compose -f compose.knowledge-python.yaml up -d --build

arcade_ready=0
for _ in $(seq 1 90); do
  if curl --silent --fail --user "root:$password" http://127.0.0.1:2480/api/v1/ready >/dev/null; then
    arcade_ready=1
    break
  fi
  sleep 2
done
if [[ "$arcade_ready" != "1" ]]; then
  echo "ArcadeDB did not become ready." >&2
  docker compose -f compose.knowledge-python.yaml logs arcadedb || true
  exit 1
fi

service_ready=0
for _ in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:8090/health >/tmp/kide-knowledge-health.json &&
    grep -q '"arcadeDbReady":true' /tmp/kide-knowledge-health.json; then
    service_ready=1
    break
  fi
  sleep 2
done
if [[ "$service_ready" != "1" ]]; then
  echo "Python knowledge service did not become ready." >&2
  docker compose -f compose.knowledge-python.yaml logs knowledge-python || true
  exit 1
fi

cat >/tmp/kide-complete-projection.json <<'JSON'
{
  "schemaVersion": 1,
  "ontologyIri": "https://kide.dev/ontology/capability",
  "scope": "global",
  "generatedAt": "2026-09-30T00:00:00Z",
  "nodes": [
    {"id":"device-robot","kind":"Device","label":"CI Robot","scope":"global","properties":{"vendor":"KIDE CI"}},
    {"id":"cap-move","kind":"Capability","label":"Move","scope":"global"},
    {"id":"iface-motion","kind":"Interface","label":"Motion","scope":"global"},
    {"id":"behavior-move","kind":"Behavior","label":"Move behavior","scope":"global"},
    {"id":"context-cell","kind":"Context","label":"Cell","scope":"global"},
    {"id":"pre-ready","kind":"Precondition","label":"Ready","scope":"global"},
    {"id":"post-moved","kind":"Postcondition","label":"Moved","scope":"global"}
  ],
  "edges": [
    {"id":"e-device-cap","kind":"hasCapability","from":"device-robot","to":"cap-move","scope":"global"},
    {"id":"e-cap-iface","kind":"hasInterface","from":"cap-move","to":"iface-motion","scope":"global"},
    {"id":"e-cap-behavior","kind":"hasBehavior","from":"cap-move","to":"behavior-move","scope":"global"},
    {"id":"e-cap-context","kind":"hasContext","from":"cap-move","to":"context-cell","scope":"global"},
    {"id":"e-cap-pre","kind":"hasPrecondition","from":"cap-move","to":"pre-ready","scope":"global"},
    {"id":"e-cap-post","kind":"hasPostcondition","from":"cap-move","to":"post-moved","scope":"global"}
  ],
  "diagnostics": []
}
JSON

curl --fail-with-body --silent   -H 'content-type: application/json'   --data-binary @/tmp/kide-complete-projection.json   http://127.0.0.1:8090/v1/projections >/tmp/kide-ingest.json

grep -q '"nodeCount":7' /tmp/kide-ingest.json
grep -q '"edgeCount":6' /tmp/kide-ingest.json
grep -q '"validationWarnings":\[\]' /tmp/kide-ingest.json

curl --fail-with-body --silent http://127.0.0.1:8090/v1/devices >/tmp/kide-devices.json
grep -q '"semanticId":"device-robot"' /tmp/kide-devices.json
grep -q '"vendor":"KIDE CI"' /tmp/kide-devices.json

curl --fail-with-body --silent http://127.0.0.1:8090/v1/capabilities >/tmp/kide-capabilities.json
grep -q '"semanticId":"cap-move"' /tmp/kide-capabilities.json

curl --fail-with-body --silent   http://127.0.0.1:8090/v1/capabilities/cap-move/devices >/tmp/kide-capability-devices.json
grep -q '"semanticId":"device-robot"' /tmp/kide-capability-devices.json

cat >/tmp/kide-invalid-projection.json <<'JSON'
{
  "schemaVersion": 1,
  "ontologyIri": "https://kide.dev/ontology/capability",
  "scope": "global",
  "generatedAt": "2026-09-30T00:00:00Z",
  "nodes": [{"id":"device-only","kind":"Device","label":"Device","scope":"global"}],
  "edges": [{"id":"bad-edge","kind":"hasCapability","from":"device-only","to":"missing-capability","scope":"global"}],
  "diagnostics": []
}
JSON

status="$(curl --silent --output /tmp/kide-invalid-response.json --write-out '%{http_code}'   -H 'content-type: application/json'   --data-binary @/tmp/kide-invalid-projection.json   http://127.0.0.1:8090/v1/projections)"
[[ "$status" == "422" ]] || {
  echo "Invalid semantic projection should fail closed with HTTP 422, got $status" >&2
  cat /tmp/kide-invalid-response.json
  exit 1
}

docker compose -f compose.knowledge-python.yaml restart knowledge-python >/dev/null
service_ready=0
for _ in $(seq 1 60); do
  if curl --silent --fail http://127.0.0.1:8090/v1/devices >/tmp/kide-devices-after-restart.json; then
    service_ready=1
    break
  fi
  sleep 2
done
[[ "$service_ready" == "1" ]] || {
  echo "Knowledge service did not recover after restart." >&2
  exit 1
}
grep -q '"semanticId":"device-robot"' /tmp/kide-devices-after-restart.json

echo "Python + ArcadeDB live semantic knowledge integration validated."

cleanup
