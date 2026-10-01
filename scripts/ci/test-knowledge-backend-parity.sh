#!/usr/bin/env bash
set -euo pipefail

password="ci-knowledge-parity-password"
export KIDE_ARCADEDB_PASSWORD="$password"

cleanup() {
  docker rm -f kide-janusgraph-parity >/dev/null 2>&1 || true
  docker compose -f compose.knowledge-python.yaml down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker run -d --name kide-janusgraph-parity -p 8182:8182 \
  -v "$PWD/knowledge/janusgraph/schema.json:/etc/opt/janusgraph/kide-schema.json:ro" \
  -e JANUS_PROPS_TEMPLATE=inmemory \
  -e janusgraph.schema.default=none \
  -e janusgraph.schema.init.strategy=json \
  -e janusgraph.schema.init.json.file=/etc/opt/janusgraph/kide-schema.json \
  -e janusgraph.schema.init.json.indices-activation=reindex_and_enable_non_enabled \
  -e gremlinserver.channelizer=org.apache.tinkerpop.gremlin.server.channel.WsAndHttpChannelizer \
  janusgraph/janusgraph:1.1.0 >/dev/null

janus_ready=0
for _ in $(seq 1 90); do
  if curl --silent --fail \
    -H 'content-type: application/json' \
    --data '{"gremlin":"g.V().count()"}' \
    http://127.0.0.1:8182 >/dev/null; then
    janus_ready=1
    break
  fi
  sleep 2
done
if [[ "$janus_ready" != "1" ]]; then
  echo "JanusGraph parity endpoint did not become ready." >&2
  docker logs kide-janusgraph-parity || true
  exit 1
fi

docker compose -f compose.knowledge-python.yaml up -d --build

python_ready=0
for _ in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:8090/health >/tmp/kide-parity-health.json &&
    grep -q '"arcadeDbReady":true' /tmp/kide-parity-health.json; then
    python_ready=1
    break
  fi
  sleep 2
done
if [[ "$python_ready" != "1" ]]; then
  echo "Python/ArcadeDB parity endpoint did not become ready." >&2
  docker compose -f compose.knowledge-python.yaml logs --no-color || true
  exit 1
fi

python knowledge/python-service/tools/graph_parity.py \
  --fixture knowledge/fixtures/parity-device-projection.json \
  --janus-url http://127.0.0.1:8182 \
  --python-url http://127.0.0.1:8090
