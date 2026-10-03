#!/usr/bin/env bash
set -euo pipefail

flag="VITE_KIDE_GRAPH_SYNTHESIS_INPUTS"

for path in Dockerfile cloudbuild.yaml docker-compose.yml compose.yaml compose.knowledge.yaml compose.knowledge-python.yaml; do
  if [[ -f "$path" ]] && grep -q "$flag" "$path"; then
    echo "$flag must remain absent from deployment defaults in $path" >&2
    exit 1
  fi
done

bunx vitest run   src/lib/kide/graph-synthesis-promotion.test.ts   src/lib/kide/graph-synthesis-assistance.test.ts   src/lib/kide/graph-synthesis-qualification.test.ts   src/lib/kide/assurance.test.ts

if grep -Eq 'graph-synthesis|knowledge/' src/lib/kide/synthesis.ts; then
  echo "The deterministic synthesizer must remain graph-independent." >&2
  exit 1
fi

grep -q 'evidence/graph-synthesis-inputs.json' src/lib/kide/release.ts
grep -q 'candidateFingerprint' src/lib/kide/release.ts
grep -q 'approvalFingerprint' src/lib/kide/release.ts

echo "Graph synthesis input promotion is default-off, fail-closed, rollback-safe and release-audited."
