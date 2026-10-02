# Feature-Flagged Graph-Assisted Candidate Enrichment

PR49 introduces the first opt-in runtime exposure of qualified graph knowledge in the synthesis review.

## Flag

`VITE_KIDE_GRAPH_ASSISTED_SYNTHESIS`

The flag is enabled only when its value is exactly:

- `1`
- `true`

All other values, including an unset value, are disabled.

The flag is intentionally not present in Docker, Compose or Cloud Build defaults. Enabling it is an explicit deployment decision.

## Behavior when disabled

- no trusted graph snapshot is requested;
- no graph recommendation UI is rendered;
- synthesis uses the existing `synthesize()` implementation unchanged;
- qualification, assurance, approval and release behavior are unchanged.

## Behavior when enabled

The synthesis review requests the authenticated trusted global graph snapshot and evaluates it through the existing PR47/PR48 shadow and qualification rules.

Recommendations become active only when:

1. baseline synthesis is ready;
2. every workflow-required capability has at least one trusted graph match;
3. each matched capability has the complete KIDE 5-tuple:
   - Interface
   - Behavior
   - Context
   - Preconditions
   - Postconditions

If any condition fails, assistance is blocked and no recommendation is applied.

## Scope of assistance

PR49 performs candidate enrichment only.

Graph knowledge may show qualified device recommendations for capabilities already required by the workflow. It does not:

- add or remove synthesis candidates;
- alter candidate scores or ranking;
- alter activity bindings;
- alter generated MNC;
- bypass qualification or assurance;
- automatically approve a design.

The deterministic browser synthesizer remains authoritative.

## Audit evidence

When a reviewer approves a design while graph assistance is active, the approval records:

- graph snapshot SHA-256;
- baseline synthesis SHA-256;
- all source fingerprints used by the recommendations.

The existing release export includes the approval object, so this evidence travels with the exported bundle.

## Promotion boundary

A future promotion PR may allow graph-derived device knowledge to influence synthesis inputs only after:

- PR48 qualification/release equivalence remains green;
- graph snapshot evidence is incorporated into release gates;
- deterministic behavior is proven with the assistance path enabled;
- explicit rollback/fallback behavior is tested.

PR49 does not cross that boundary.
