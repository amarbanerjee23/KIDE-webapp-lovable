# Synthesis Assurance Contract

KIDE cannot honestly claim an absolute proof that every possible synthesized controller is correct.
Instead, release-grade synthesis is governed by a bounded assurance contract.

## Required guarantees

A synthesized candidate is eligible for approval only when all of the following hold:

1. **Deterministic input baseline** — identical canonical model sources produce byte-identical
   synthesized designs.
2. **Complete preflight** — unresolved model references, missing interfaces, incomplete workflow
   links, and invalid DSL syntax block synthesis rather than being guessed.
3. **Capability contract validity** — a capability is treated as the thesis 5-tuple
   `(Interface, Behavior, Context, Preconditions, Postconditions)`. Missing contract knowledge
   must be surfaced explicitly.
4. **Independent output validation** — generated M&C/control DSL is re-parsed and validated by
   the language implementation independently of the synthesis code that emitted it.
5. **Traceable decisions** — every candidate carries an evidence ledger identifying the rule and
   source model elements used for each binding.
6. **Algorithm properties** — determinism, irrelevant-input invariance and declaration-order
   invariance are exercised as qualification properties.
7. **Reference conformance** — the browser implementation is compared with the retained reference
   corpus/desktop transformation expectations.
8. **Scale boundary** — results beyond the validated device scale are reported as unqualified
   rather than silently presented as proven.
9. **Exact approval fingerprint** — approval applies only to the exact generated design fingerprint;
   any source or generated-design change invalidates the approval.
10. **Checksummed release** — exported release artifacts carry deterministic SHA-256 provenance and
    release remains blocked while any assurance gate fails.

## Knowledge-graph assisted synthesis

The global device knowledge graph is an input source, not an authority that may silently alter
synthesis semantics.

Graph-assisted synthesis must remain behind an explicit feature flag until all of these gates pass:

- the graph query result can be reduced to the same canonical capability/interface representation
  consumed by the current synthesis engine;
- shadow queries against the existing graph path and the Python/ArcadeDB projection return the same
  semantic IDs and contract fields for the qualification corpus;
- incomplete or contradictory graph knowledge fails closed;
- every externally acquired device fact includes provenance, retrieval time, source license and
  confidence;
- the current synthesis qualification and release suites pass unchanged with graph assistance
  disabled;
- a separate graph-assisted corpus proves deterministic results for a fixed graph snapshot.

The default production path must remain unchanged until those gates are met.
