# Graph Synthesis Qualification Corpus

PR48 proves that observing trusted graph knowledge does not change the current release-grade synthesis pipeline.

## Corpus invariants

For every case:

- graph assistance remains shadow-only;
- `applied` is always false;
- baseline synthesis is recomputed independently after shadow analysis;
- qualification evidence must remain byte-equivalent;
- assurance gates/findings must remain stable;
- release manifest SHA-256 must remain identical.

## Qualification cases

1. complete trusted graph knowledge for every required capability;
2. identical graph knowledge in reverse device order;
3. irrelevant trusted graph knowledge;
4. one required capability missing from the graph;
5. one graph capability with an incomplete 5-tuple;
6. an invalid workspace whose release is already blocked.

The negative cases must fail graph promotion eligibility while preserving the baseline release result.

## Promotion rule

A later feature-flagged graph-assistance PR may not change production synthesis unless this corpus remains green and the graph snapshot used by synthesis is recorded in release evidence.

PR48 itself does not enable graph-assisted synthesis.
