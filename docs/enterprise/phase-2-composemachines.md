# Phase 2 — deterministic COMPOSEMACHINES

Phase 2 turns the Phase-1 semantic resolver into an executable composition engine.

## Request contract

A synthesis request now declares:

- activities and required capability IRIs;
- one state-machine definition per required capability;
- the required session type for every capability machine;
- an execution plan made of sequential and/or parallel activity groups.

When no execution plan is supplied, the declared activity order is treated as one sequential chain.

## Composition invariants

1. Capability IRIs are validated before they are interpolated into SPARQL.
2. Every activity must resolve to a declared capability machine.
3. Every capability must be offered by at least one device.
4. A device is eligible only when its semantic `sessionType` exactly matches the capability machine's required session type.
5. Device selection is deterministic: the lexicographically first compatible device is selected.
6. State names are namespaced by activity, preventing collisions when machines are merged.
7. Sequential activities on the same device receive synthetic transitions from every predecessor end state to every successor start state.
8. Sequential activities on different devices produce explicit cross-device coordination edges.
9. Parallel groups receive no synthetic sequencing transitions and remain independently startable.
10. Conflicting sequential/parallel declarations fail closed.

## Output

The worker returns:

- semantic activity-to-device bindings;
- one synthesized controller per device;
- namespaced states and transitions;
- controller start/end states after composition;
- cross-device coordination edges;
- explicit parallel groups;
- evidence counts for session validation and synthesized coordination.

## Verification

The service test suite covers malformed requests, SPARQL injection-shaped IRIs, state-machine integrity, missing machines, missing devices, session incompatibility, deterministic selection, sequential composition, cross-device composition, parallel independence, state namespacing, monotonic progress, and API request validation.
