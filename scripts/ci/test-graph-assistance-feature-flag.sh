#!/usr/bin/env bash
set -euo pipefail

flag="VITE_KIDE_GRAPH_ASSISTED_SYNTHESIS"

# The production/deployment baseline must remain default-off. Enabling this flag
# is an explicit operational decision and must not be baked into deployment files.
for path in Dockerfile cloudbuild.yaml docker-compose.yml compose.yaml compose.knowledge.yaml compose.knowledge-python.yaml; do
  if [[ -f "$path" ]] && grep -q "$flag" "$path"; then
    echo "$flag must not be enabled or defaulted in $path" >&2
    exit 1
  fi
done

bunx vitest run   src/lib/kide/graph-synthesis-assistance.test.ts   src/lib/kide/graph-synthesis-qualification.test.ts

# Guard the architectural boundary: the deterministic synthesizer itself must
# not import graph knowledge or feature-flag logic.
if grep -Eq 'graph-synthesis|knowledge/' src/lib/kide/synthesis.ts; then
  echo "synthesis.ts must remain independent of graph assistance." >&2
  exit 1
fi

echo "Graph-assisted synthesis remains explicit, default-off and qualification-gated."
