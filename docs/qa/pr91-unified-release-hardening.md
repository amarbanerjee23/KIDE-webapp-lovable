# PR91 — Unified production data-safety and CI hardening

This PR combines the previously proposed project-navigation, autosave-retry,
working-copy uniqueness and full-release lint work. It performs **no**
production deployment, DB migration, payment activation or release publication.

## Engineering safety
- Active-project selection is now a synchronous, fail-closed operation while
  an editable project has uncommitted source changes or a save request in flight.
- All explicit project-card links cancel navigation on a rejected selection;
  Reviews/Checkpoints picker state also retains the previously selected project.
- Cross-tab `storage` events cannot silently change a tab whose source map
  is dirty; the other tab's storage write is not echoed to avoid loops.
- A forced `clearActiveProject` remains available for session revocation and
  access removal; a user cannot preserve authorization by keeping unsaved work.
- Existing browser beforeunload warning and verified model-set backup remain.
- Transient transport/429/502-504/503 save errors receive at most three bounded
  exponential retries, preserving the last PostgreSQL CAS revision. Genuine
  conflicts, authorization and validation errors do not retry automatically.
  Manual Retry save continues to work without reloading the editor.
- No auto-discard path, optimistic overwrite, or cross-project save bypass is added.

## Database migration (not automatic)
1. Verify exact-main CI, obtain a recent backup and confirm PITR.
2. Run `db/queries/working_copy_duplicate_audit.sql` **read-only** against
   the actual production database. Retain query results and operator approval.
3. If rows are returned, STOP. Reconcile each project against backups with the
   application owner; do not remove rows based only on timestamp.
4. In a managed migration window, after zero duplicates are confirmed, apply
   `db/migrations/20261011_unique_project_working_copy.sql` using approved
   database credentials. It fails transactionally if duplicates appeared.
5. Confirm PostgreSQL index definition, read-only project load, save, checkpoint,
   rollback readiness, and record the migration run. Do not modify Cloud SQL
   through GitHub PR CI.

The existing application transaction lock remains required; the partial index
is defense in depth, not a substitute for version-based concurrency control.

## Automated acceptance
- Unit matrix: guard rejection, forced session clearing, debounce/in-flight
  decisions, transient retry classification and capped retry delays.
- Configured-auth Playwright: cross-tab selection attempt while editing offline
  retains source and successful eventual save.
- PostgreSQL schema job: deliberately install duplicate historical working
  copies, confirm the migration rejects them, clean up the *CI fixture only*,
  apply the migration twice and verify duplicates are thereafter impossible.
- Run full ESLint across the repository on PR and main, plus existing typecheck,
  unit/coverage, Docker/PostgreSQL/Better Auth E2E, and 18 CI jobs.

## Post-merge launch gates
Successful PR CI is not production qualification. Verify the *new* main SHA,
run protected exact-main deployment, Cloud SQL recovery test, real production
journeys, operational/legal sign-off, then separate guarded publication per
issue #65. Keep payments disabled and release scope free-evaluation.
