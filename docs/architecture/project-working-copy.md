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


## Project-native workspace lifecycle

An authenticated project workspace is never populated from demo data implicitly.

- no active project -> browser workspace is empty;
- active project with no working copy -> browser workspace is empty;
- persisted source-map keys are the authoritative project filenames;
- DSL kind is derived from each persisted filename extension rather than a fixed sample manifest;
- unsupported file extensions may remain in storage but are not treated as KIDE DSL inputs;
- the reference/sample workspace is loaded only after an explicit user action;
- session loss clears the in-memory project workspace.

The visual designer binds to the active project's actual `.activity` file. It must not assume the
reference filename `MissionPlanning.activity`.


## Concurrent browser protection

Working-copy autosave uses optimistic concurrency based on the persisted working-copy timestamp.

1. load returns the current `savedAt` version;
2. every autosave sends that version as `expectedSavedAt`;
3. the backend updates only when the persisted timestamp still matches;
4. a mismatch rejects the save rather than overwriting another browser/tab;
5. local browser edits remain intact;
6. autosave is blocked for that project until the user reloads/reconciles.

A newly empty project is a valid workspace state. Empty source maps are not treated as an error.
