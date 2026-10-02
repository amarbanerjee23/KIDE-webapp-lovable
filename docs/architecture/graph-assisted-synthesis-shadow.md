# Graph-Assisted Synthesis Shadow Mode

PR47 introduces observation-only graph assistance.

## Invariants

- Browser synthesis remains the only code path that produces candidates.
- Trusted graph knowledge is retrieved through an authenticated backend I/O boundary.
- The backend does not import or execute KIDE synthesis or DSL computation.
- Graph knowledge cannot alter bindings, candidate ranking, generated MNC, qualification, approval or release.
- Shadow analysis always reports `applied: false`.

## Trusted candidate retrieval

Only global Device nodes with ingestion provenance are exposed to shadow mode:

- source fingerprint
- source license
- retrieval timestamp
- confidence >= 0.80

For each device, the retrieval boundary returns capability contracts and the semantic IDs linked through:

- hasInterface
- hasBehavior
- hasContext
- hasPrecondition
- hasPostcondition

## Browser shadow analysis

The browser compares workflow-required capability names with trusted graph candidates and records:

- required capabilities
- matching trusted devices
- missing capabilities
- incomplete contracts
- SHA-256 fingerprint of the current deterministic synthesis result
- SHA-256 fingerprint of the trusted graph snapshot
- promotion eligibility

Promotion eligibility is informational only in PR47.

A graph snapshot is not eligible when:
- baseline synthesis is blocked;
- any required capability has no graph match;
- any matching capability lacks part of the 5-tuple.

## Promotion boundary

A later PR may introduce an explicit feature flag only after the qualification corpus proves that using graph candidates preserves deterministic synthesis and release evidence.

PR47 does not contain such a flag.
