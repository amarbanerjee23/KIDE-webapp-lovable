#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Python knowledge service contract failure: $*" >&2
  exit 1
}

test -f knowledge/python-service/pyproject.toml || fail "pyproject missing"
test -f knowledge/python-service/app/main.py || fail "FastAPI service missing"
test -f knowledge/python-service/app/ontology.py || fail "ontology validator missing"
test -f knowledge/python-service/app/arcadedb.py || fail "ArcadeDB projection adapter missing"
test -f compose.knowledge-python.yaml || fail "compose overlay missing"

python3 -m compileall -q knowledge/python-service/app knowledge/python-service/tests

grep -q 'arcadedata/arcadedb:26.9.1' compose.knowledge-python.yaml ||
  fail "ArcadeDB image must be pinned to 26.9.1"
grep -q 'knowledge-python' compose.knowledge-python.yaml ||
  fail "Python service not declared"
grep -q 'kide-capability.ttl' knowledge/python-service/app/config.py ||
  fail "service is not bound to the KIDE ontology"
grep -q 'hasPrecondition' knowledge/python-service/app/ontology.py ||
  fail "capability precondition contract is not validated"
grep -q 'hasPostcondition' knowledge/python-service/app/ontology.py ||
  fail "capability postcondition contract is not validated"

KIDE_ARCADEDB_PASSWORD=ci-contract-only docker compose -f compose.knowledge-python.yaml config >/tmp/kide-python-knowledge-compose.yaml

echo "Python semantic knowledge service contract validated."
