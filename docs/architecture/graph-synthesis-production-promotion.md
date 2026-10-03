# Graph-Assisted Synthesis Production Promotion

PR51 adds operational controls around the PR50 promoted graph-input path.

## Two-key production gate

Promoted graph synthesis inputs are active only when both conditions hold:

1. build capability flag `VITE_KIDE_GRAPH_SYNTHESIS_INPUTS` is explicitly enabled;
2. runtime `KIDE_GRAPH_SYNTHESIS_PRODUCTION_ENABLED` is explicitly `1` or `true`.

The runtime kill switch always wins:

`KIDE_GRAPH_SYNTHESIS_KILL_SWITCH=1`

When the kill switch is active, graph synthesis promotion falls back to the exact project-only baseline path.

## Runtime behavior

The authenticated browser workspace reads the production policy from the server. Synthesis Review and Release Centre revalidate the policy and graph snapshot every 30 seconds.

This means operations can disable graph synthesis promotion without rebuilding the application, and an open review/release page will converge to the safe fallback state.

## Approval drift

An approval created while promoted graph inputs are active is bound to the exact:

- workspace fingerprint;
- graph snapshot fingerprint;
- baseline synthesis fingerprint;
- generator and qualification versions;
- graph bindings and source fingerprints;
- generated candidate fingerprint.

Release re-fetches the current graph snapshot and recomputes the promoted input evidence.

The approval is invalidated when:

- the kill switch becomes active;
- runtime promotion is disabled;
- the graph cannot be retrieved;
- the graph snapshot changes;
- promoted capability bindings change;
- the project models change;
- the generated design changes.

## Release gate

Reviewer approval validity is now part of the checksummed release manifest.

If the current approval is stale, the bundle contains:

`Current reviewer approval`

in `blockedBy`, and the manifest is marked non-releasable.

## Deployment policy

Production enablement is not hard-coded in Docker, Compose, or Cloud Build defaults. Promotion is an explicit operational configuration.

The deterministic browser `synthesize()` function remains graph-independent and the project-only path remains the rollback path.
