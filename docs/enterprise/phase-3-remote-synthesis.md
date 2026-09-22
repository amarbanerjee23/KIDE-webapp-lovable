# Phase 3 — remote synthesis cutover and live progress

This phase connects the synthesis review to the enterprise worker without removing the deterministic browser implementation used for local development and rollback.

## Runtime behavior

When `VITE_KIDE_API_BASE_URL` is configured:

1. the browser derives a remote synthesis contract from the linked KIDE workspace;
2. only capability-backed activities are submitted;
3. device operating states, start states, end states, and declared command-driven transitions come from the MNC model;
4. capability session type is not invented in the browser — the worker resolves it from Jena;
5. the synthesis job is submitted asynchronously;
6. progress is consumed through Server-Sent Events;
7. if the SSE connection is unavailable or drops, the client automatically falls back to polling;
8. design approval is gated until remote synthesis completes successfully.

When no remote API is configured, the existing local synthesis review remains unchanged.

## Fail-closed adapter rules

Remote synthesis is blocked when:

- the workspace has parser/linker errors;
- capability references do not resolve;
- a bound interface lacks operating/start/end state metadata;
- capability execution is cyclic;
- capability execution branches to multiple successors;
- interruption or child-diagram edges would make linear composition ambiguous;
- not all capability-backed activities belong to one reachable linear path.

These restrictions are intentional. The adapter does not flatten unsupported workflow semantics into a false sequence.

## Semantic session contract

A capability machine may omit `sessionType`. In that case the worker queries Jena for exactly one `kide:sessionType` on the capability IRI. Missing or ambiguous session metadata fails synthesis.

## Progress endpoint

`GET /api/v1/synthesis/{jobId}/events` returns `text/event-stream` snapshots for queued/running/progress/completed/failed states. Terminal events close the stream.
