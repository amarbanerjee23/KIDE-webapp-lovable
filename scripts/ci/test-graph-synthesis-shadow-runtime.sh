#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  docker rm -f kide-shadow-janus >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker run -d --name kide-shadow-janus -p 8184:8182 \
  -v "$PWD/knowledge/janusgraph/schema.json:/etc/opt/janusgraph/kide-schema.json:ro" \
  -e JANUS_PROPS_TEMPLATE=inmemory \
  -e janusgraph.schema.default=none \
  -e janusgraph.schema.init.strategy=json \
  -e janusgraph.schema.init.json.file=/etc/opt/janusgraph/kide-schema.json \
  -e janusgraph.schema.init.json.indices-activation=reindex_and_enable_non_enabled \
  -e gremlinserver.channelizer=org.apache.tinkerpop.gremlin.server.channel.WsAndHttpChannelizer \
  janusgraph/janusgraph:1.1.0 >/dev/null

ready=0
for _ in $(seq 1 90); do
  if curl --silent --fail     -H 'content-type: application/json'     --data '{"gremlin":"g.V().count()"}'     http://127.0.0.1:8184 >/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
[[ "$ready" == "1" ]] || {
  echo "JanusGraph shadow runtime did not become ready." >&2
  docker logs kide-shadow-janus || true
  exit 1
}

seed='
def addNode(id, kind, label, props) {
  g.addV("KideEntity")
    .property("semanticId", id)
    .property("kind", kind)
    .property("displayName", label)
    .property("scope", "global")
    .property("projectId", "")
    .property("sourcePath", "")
    .property("propertiesJson", groovy.json.JsonOutput.toJson(props))
    .next()
}
def device = addNode("urn:shadow:device", "Device", "Shadow Robot", [
  manufacturer:"KIDE", model:"S1",
  "prov:hadPrimarySource":"https://example.test/shadow",
  sourceLicense:"CC-BY-4.0",
  sourceVersion:"1",
  "prov:generatedAtTime":"2026-10-02T00:00:00Z",
  confidence:0.97d,
  sourceFingerprint:"shadow-source"
])
def cap = addNode("urn:shadow:cap", "Capability", "Move", [:])
def iface = addNode("urn:shadow:iface", "Interface", "Motion", [:])
def behavior = addNode("urn:shadow:behavior", "Behavior", "Move", [:])
def context = addNode("urn:shadow:context", "Context", "Cell", [:])
def pre = addNode("urn:shadow:pre", "Precondition", "Ready", [:])
def post = addNode("urn:shadow:post", "Postcondition", "Moved", [:])
def connect(from, to, id, kind) {
  from.addEdge("semanticRelation", to,
    "semanticId", id, "kind", kind, "scope", "global",
    "projectId", "", "propertiesJson", "{}")
}
connect(device, cap, "e0", "hasCapability")
connect(cap, iface, "e1", "hasInterface")
connect(cap, behavior, "e2", "hasBehavior")
connect(cap, context, "e3", "hasContext")
connect(cap, pre, "e4", "hasPrecondition")
connect(cap, post, "e5", "hasPostcondition")
g.tx().commit()
"seeded"
'

curl --fail-with-body --silent   -H 'content-type: application/json'   --data "$(python3 -c 'import json,sys; print(json.dumps({"gremlin":sys.stdin.read()}))' <<<"$seed")"   http://127.0.0.1:8184 >/tmp/kide-shadow-seed.json

KIDE_KNOWLEDGE_GRAPH_URL=http://127.0.0.1:8184 bun -e '
  import { readTrustedGlobalKnowledgeSnapshot } from "./src/lib/knowledge/knowledge-graph.server.ts";
  const snapshot = await readTrustedGlobalKnowledgeSnapshot();
  if (snapshot.devices.length !== 1) throw new Error(`Expected one trusted device, got ${snapshot.devices.length}`);
  const device = snapshot.devices[0];
  if (device?.semanticId !== "urn:shadow:device") throw new Error("Trusted device identity mismatch");
  if (device.confidence !== 0.97) throw new Error("Confidence mismatch");
  const cap = device.capabilities[0];
  if (!cap || cap.label !== "Move") throw new Error("Capability retrieval mismatch");
  for (const key of ["interfaceIds","behaviorIds","contextIds","preconditionIds","postconditionIds"]) {
    if (!Array.isArray(cap[key]) || cap[key].length !== 1) throw new Error(`Incomplete contract field ${key}`);
  }
  console.log(JSON.stringify(snapshot));
'
