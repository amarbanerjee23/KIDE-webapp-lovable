#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Knowledge Fabric contract failure: $*" >&2
  exit 1
}

test -f knowledge/ontology/kide-capability.ttl || fail "ontology missing"
test -f knowledge/ontology/kide-capability.shacl.ttl || fail "SHACL shapes missing"
test -f knowledge/rules/thesis-capability.rules || fail "thesis inference rule missing"
test -f compose.knowledge.yaml || fail "knowledge compose overlay missing"
test -f knowledge/janusgraph/schema.json || fail "JanusGraph schema missing"

for concept in Action Activity Device Capability Interface SessionType Workflow Behavior Interaction; do
  grep -q "kide:${concept} a owl:Class" knowledge/ontology/kide-capability.ttl ||
    fail "ontology class missing: ${concept}"
done

for property in fulfilledBy hasActivities hasCapability hasInteractions hasInterface implementsSession requiredCapability; do
  grep -q "kide:${property} a owl:ObjectProperty" knowledge/ontology/kide-capability.ttl ||
    fail "thesis property missing: ${property}"
done

for tuple_property in hasBehavior hasContext hasPrecondition hasPostcondition; do
  grep -q "kide:${tuple_property} a owl:ObjectProperty" knowledge/ontology/kide-capability.ttl ||
    fail "capability tuple property missing: ${tuple_property}"
done

grep -q "CapabilityInvocation" knowledge/rules/thesis-capability.rules ||
  fail "CapabilityInvocation inference contract missing"
grep -q "hasCapability" knowledge/rules/thesis-capability.rules ||
  fail "hasCapability inference result missing"

docker compose -f compose.yaml -f compose.knowledge.yaml config >/tmp/kide-knowledge-compose.yaml

grep -q "janusgraph/janusgraph:1.1.0" /tmp/kide-knowledge-compose.yaml ||
  fail "JanusGraph is not pinned"
grep -q "cassandra:4.0" /tmp/kide-knowledge-compose.yaml ||
  fail "Cassandra is not pinned"
grep -q "KIDE_KNOWLEDGE_GRAPH_URL" /tmp/kide-knowledge-compose.yaml ||
  fail "KIDE is not wired to the knowledge graph endpoint"
grep -q "schema.init.strategy" /tmp/kide-knowledge-compose.yaml ||
  fail "JanusGraph schema initialization is not enabled"
grep -q "schema.default" /tmp/kide-knowledge-compose.yaml ||
  fail "JanusGraph automatic schema policy is not explicit"

for index in vertexBySemanticId vertexByProjectScope vertexByKind edgeBySemanticId edgeByProjectScope; do
  grep -q "\"name\": \"${index}\"" knowledge/janusgraph/schema.json ||
    fail "JanusGraph index missing: ${index}"
done

echo "Ontology, reasoning, indexed graph schema and distributed deployment contracts validated."
