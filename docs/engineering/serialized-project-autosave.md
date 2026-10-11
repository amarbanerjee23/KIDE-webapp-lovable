# PR86: Sequential, project-isolated autosave

A save request from an earlier active project can finish after the user
switches project, reloads the workspace, or signs out. Before PR86, that
outdated promise callback could mutate the new project's `savedAt` revision
and global `Saved`/error/conflict state. Editing again while the previous
save was still in flight also allowed two requests to use the same optimistic
concurrency token (`expectedSavedAt`), creating a false conflict.

PR86 now:

- issues each save a project ID and workspace-load generation ticket and
  drops stale callbacks before they touch the current project or notify users;
- permits only one in-flight save per active project generation;
- tracks the most recently edited source map, preserving the Saving state
  until newer edits are committed after the first request returns;
- sends the next queued edit with the **newly committed** PostgreSQL CAS token,
  rather than submitting a parallel write with an obsolete token;
- keeps the existing real multi-session conflict detection: another session
  modifying the same project must still fail closed rather than overwrite it.

The change does not claim that navigating away before the initial 750 ms
debounce has elapsed persists otherwise unsaved edits. This remains a
separate UX concern, and the UI must still show Saving until a request
succeeds.

Verification: `src/lib/kide/workspace-autosave.test.ts` covers stale
response gating and queued edit transitions. The real PostgreSQL-backed
Playwright checkpoint journey also performs rapid changes and confirms that
the final workspace persists after reload. CI checks guard the connection
between the pure decisions and the React save coordinator.
