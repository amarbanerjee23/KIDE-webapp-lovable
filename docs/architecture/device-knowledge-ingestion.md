# Device Knowledge Ingestion and Trust Contract

PR46 introduces a source-to-knowledge normalization boundary. It does not change synthesis.

## Source contract

Each ingestion request identifies:

- source URI
- publisher / responsible organization
- license
- retrieval timestamp
- source type
- optional source version
- normalized manufacturer/model identity
- one or more capability contracts
- confidence score in the range 0..1

The provenance vocabulary intentionally aligns with W3C PROV concepts:

- `prov:hadPrimarySource`
- `prov:wasAttributedTo`
- `prov:generatedAtTime`

## Promotion rules

Knowledge is accepted only when:

1. at least one capability is present;
2. every capability includes Interface, Behavior, Context, Preconditions and Postconditions;
3. confidence is at least 0.80;
4. the source license is explicit and not marked unknown/unlicensed/none;
5. the resulting KIDE projection passes ontology-level endpoint and contract validation.

Anything else is quarantined and returned with explicit reasons.

## Mutation boundary

`POST /v1/ingestion/preview`

- normalizes and evaluates the source;
- returns the canonical KIDE projection and decision;
- performs no graph write.

`POST /v1/ingestion/commit`

- reruns the same deterministic normalization and trust decision;
- writes only when the decision is `accepted`;
- returns HTTP 422 for quarantined knowledge;
- uses deterministic semantic IDs so repeated ingestion of the same device is idempotent.

## Synthesis isolation

No browser synthesis, qualification, assurance or release module reads these ingestion endpoints.
Ingested knowledge is not synthesis-eligible merely because it exists in the graph.

A later graph-assisted synthesis PR must separately prove:
- canonical query compatibility;
- backend parity;
- fixed-snapshot determinism;
- trust/provenance visibility;
- qualification equivalence;
- fail-closed behavior for contradictory or incomplete knowledge.
