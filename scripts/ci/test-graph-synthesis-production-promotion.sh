#!/usr/bin/env bash
set -euo pipefail

enable_flag="KIDE_GRAPH_SYNTHESIS_PRODUCTION_ENABLED"
kill_flag="KIDE_GRAPH_SYNTHESIS_KILL_SWITCH"

for path in Dockerfile cloudbuild.yaml docker-compose.yml compose.yaml compose.knowledge.yaml compose.knowledge-python.yaml; do
  [[ -f "$path" ]] || continue
  if grep -Eq "${enable_flag}[=:][[:space:]]*(1|true)([[:space:]]|$)" "$path"; then
    echo "$enable_flag must not be hard-coded enabled in $path" >&2
    exit 1
  fi
  if grep -Eq "${kill_flag}[=:][[:space:]]*(0|false)([[:space:]]|$)" "$path"; then
    echo "$kill_flag must not be hard-coded disabled in $path" >&2
    exit 1
  fi
done

bunx vitest run \
  src/lib/knowledge/graph-synthesis-policy.test.ts \
  src/lib/kide/graph-synthesis-production.test.ts \
  src/lib/kide/graph-synthesis-promotion.test.ts \
  src/lib/kide/graph-synthesis-qualification.test.ts

grep -q 'getGraphSynthesisProductionPolicy' src/routes/synthesis.tsx
grep -q 'getGraphSynthesisProductionPolicy' src/routes/release.tsx
grep -q 'approvalIsCurrentForSynthesisContext' src/routes/release.tsx
grep -q 'Current reviewer approval' src/lib/kide/release.ts

echo "Graph synthesis production promotion is runtime-gated, kill-switchable, drift-sensitive and release-blocking."
