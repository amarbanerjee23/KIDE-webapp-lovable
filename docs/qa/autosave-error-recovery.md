# PR90 — Recoverable save failures without losing the editor

Source audit found that the modeller previously rendered the same full-page
"Project workspace could not be loaded" branch for **both a real failed
initial load and an autosave error after successful loading**. The latter
could hide unsaved in-memory models and offered a "Retry loading" action that
discarded those edits. This is a P1 user-data-recovery bug.

PR90 distinguishes `load-error` from `error` (autosave error):
- only a failed initial load blocks the editor and offers Retry loading;
- after save failure, offline state or true multi-session conflict, the
  editable models remain in the browser with an explicit persistent warning;
- a save-error Retry action retries the current unsaved source map with the
  existing CAS token and **does not reload**;
- any nonempty pending local source map can be exported to a verified
  `kide.modelset/1` JSON backup even while offline or conflicted;
- the browser's standard beforeunload confirmation is enabled while local
  uncommitted edits exist (browser support varies).

A real Chromium/PostgreSQL/Better Auth E2E starts with a saved project, takes
the browser offline, changes the model set, proves the editor remains visible,
downloads the offline backup, reconnects, waits for successful save and
reloads the persisted final sources.

**Not yet addressed**: the SPA project-switch flow can still abandon edits
during its 750 ms save debounce. A separate save-before-switch or guarded
confirmation/flush workflow is required before unqualified go-live.
Automatic bounded retry/backoff for non-offline HTTP errors also remains
future work; this PR provides explicit safe retry instead.
