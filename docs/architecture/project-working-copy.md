# Project working-copy persistence

KIDE keeps all engineering computation in the browser. Project persistence is only an I/O concern.

## Working copy

Each project has one hidden working-copy record in the existing `model_checkpoints` table using the
reserved label `__kide_working_copy__`.

The browser:

1. selects one active project;
2. loads that project's source map when entering authenticated application routes;
3. performs all parsing, linking, diagnostics, synthesis, scenarios, and validation locally;
4. autosaves the source map after 750 ms of inactivity.

The backend only authenticates, authorizes, validates storage size/shape, and reads/writes the JSON
source map.

## Named checkpoints

Named checkpoints remain explicit user-created history. The hidden working-copy row is excluded
from checkpoint listings and cannot be created accidentally through the checkpoint label field.

## Roles

Owners, administrators, and engineers may update the working copy. Reviewers and viewers may load
it but remain read-only.

## Session hygiene

The active project is stored locally in the browser for refresh continuity. Signing out clears both
the active-project identifier and the in-memory workspace before returning to the public home page.

## No schema migration

This design deliberately reuses the existing `projects` and `model_checkpoints` tables. It does
not introduce another persistence service, worker, database, or server-side KIDE computation.
