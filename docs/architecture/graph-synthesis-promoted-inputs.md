# Promoted Graph-Assisted Synthesis Inputs

PR50 introduces the first explicitly enabled path where trusted graph knowledge enters the synthesis context.

## Flag

`VITE_KIDE_GRAPH_SYNTHESIS_INPUTS`

Only `1` or `true` enables the path. The flag is intentionally absent from Docker, Compose and Cloud Build defaults.

## What is promoted

The graph may deterministically select one trusted device binding for each workflow-required capability.

Selection order is:

1. highest confidence;
2. semantic device ID;
3. capability ID.

The selected bindings become auditable synthesis-input evidence.

## Safety boundary

The global graph currently contains capability contracts, semantic identifiers and provenance, but it does not yet contain sufficient executable interface detail to safely generate commands or MNC for a graph-only device.

Therefore PR50 does not fabricate executable logic from graph metadata.

`synthesize()` remains unchanged and graph-independent. Executable commands, component interfaces and generated MNC continue to come only from validated project models.

## Fail-closed fallback

Promotion falls back to the exact baseline synthesis report when:

- the flag is disabled;
- the graph is unavailable;
- baseline synthesis is blocked;
- a required capability is missing;
- a capability contract lacks any part of the KIDE 5-tuple.

Fallback never mutates or replaces the project-only result.

## Release evidence

When promotion is active, approval and release evidence records:

- workspace SHA-256;
- graph snapshot SHA-256;
- baseline synthesis SHA-256;
- generator version;
- qualification version;
- deterministic graph capability-to-device bindings;
- source fingerprints;
- selected generated candidate SHA-256;
- reviewer approval fingerprint.

The graph input evidence is stored as `evidence/graph-synthesis-inputs.json` and included in the checksummed release manifest.

## Promotion boundary

PR50 is still default-off. It does not make graph assistance the production default.

A later production-promotion decision must additionally prove that graph data contains enough executable interface semantics to safely affect generated control logic, or explicitly retain project-model-only executable generation.
