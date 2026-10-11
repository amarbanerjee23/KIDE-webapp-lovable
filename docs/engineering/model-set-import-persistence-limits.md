# PR87 — Safe, bounded model-set exchange

A verified SHA-256 digest proves the bytes were not changed, but does not
prove an imported model set fits the active project's PostgreSQL persistence
contract. Before PR87 the import UI accepted and replaced the current
workspace with a validly checksummed model set containing more than 100
files or overlarge models, which the working-copy save service then refused.
This stranded edits locally with a Save failed status.

The exchange layer now uses `validateWorkingCopySources` before exporting
and before declaring any incoming model set importable. It enforces the same
canonical paths and case-insensitive uniqueness plus these backend limits:

- 100 model files, maximum;
- 512 characters per relative file path;
- 1,000,000 source characters per file;
- 5,000,000 source characters for the entire model set.

A lightweight 40 MiB JSON upload limit guards browser memory use before
`file.text()`; the same maximum is checked before parsing programmatic
imports. This ceiling leaves room for the full 5M-character source allowance
even when JSON characters are escaped. Filenames with uppercase supported
DSL extensions now round-trip correctly through export and import.

On rejection the app shows an explicit error, never opens the Replace
workspace confirmation and never changes the active project's model set.
A failed export also displays a non-destructive toast instead of throwing
an unhandled UI exception.

Regression coverage includes count boundaries, valid uppercase file
extensions, correct checksums with overlarge content, aggregate overflow,
pre-read size checks and real PostgreSQL-backed import/reload preservation.

No schema migration, production deployment, or live data mutation is part
of this PR.
