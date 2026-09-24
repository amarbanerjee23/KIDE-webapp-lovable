# PR21 — Eclipse runtime comparison corpus and conformance evidence

Status: planned implementation PR.

## Scope
- capture authoritative comparison outputs from a running Eclipse KIDE installation;
- version the captured fixtures with provenance;
- extend browser-vs-desktop comparison coverage;
- make unexplained semantic differences fail qualification;
- ship comparison evidence in the release evidence bundle;
- preserve deterministic browser-side KIDE computation.

## Merge gate
The expanded corpus, conformance tests, evidence generation and CI must be green before merge.
