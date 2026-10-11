# KIDE production release — evidence-based bug hunt (11 October 2026)

## Scope and method

Audited merged `main` at `601df39322963222dc6b0ba95d7657ccdda2070e`: user creation, project working-copy
persistence, server authorization, billing lifecycle gates, launch artifacts,
CI contracts and the current go-live issue. This is a source/CI review and
**not** an authenticated remote production browser session or a Cloud SQL
restore drill. An external request to the Cloud Run URL could not be completed
from the available execution environment. No customer credentials or secrets
were logged, and no real production data was mutated.

## Confirmed defect and correction

**P1 — first-save multi-tab race:** `saveProjectWorkingCopy` read a missing
reserved-label checkpoint outside a transaction and then inserted one row.
`model_checkpoints` has no uniqueness constraint for the reserved label.
Two sessions could simultaneously insert two records and both appear saved.
PR89 serializes the initial read/write on the project row in one transaction;
detects and rejects existing duplicate records; adds a two-tab E2E regression
and a real PostgreSQL CI invariant. **Production must be separately inspected
for historical duplicates before deployment.**

## Open bugs, limitations and unresolved release evidence

| Priority | Finding | Evidence | Status / next action |
| --- | --- | --- | --- |
| P0 go-live | Latest merged `main` must pass its own push-event CI before deployment | GitHub run for `601df39322963222dc6b0ba95d7657ccdda2070e` initially in progress | Verify successful conclusion and fresh SHA |
| P0 go-live | Exact-main protected deployment, image digest, IAM and Cloud SQL binding | Issue #65 checklist, no current protected deployment evidence | Run workflow with approvals; attach immutable artifacts |
| P0 go-live | Cloud SQL PITR/backups and a **real clone restore drill** | Issue #65 and recovery runbook remain unchecked | Perform independently verified clone/read-only SQL integrity drill |
| P0 go-live | Live smoke, sign-up/auth, five-example creation and codegen/release export on Cloud Run | Browser CI runs in Docker, not the deployed Google Cloud service | Run protected production qualification on exact deployed SHA |
| P0 go-live | On-call/alerts/rollback, Terms/Privacy reviews, independent release approval | Issue #65 unchecked | Obtain operator and business sign-off; verify rollback |
| P0 launch scope | Paid plans and entitlements are not qualified for launch | `PAID_BILLING_ENABLED=false` and issue #74 | Keep v1.0.0 free evaluation; require explicit product-owner scope approval; do not enable Hyperswitch |
| P1 UX | Unsaved editor changes can be lost if a user switches project or closes a tab before the 750 ms debounce | `useWorkspacePersistence` clears old workspace on project changes; no completed navigation guard | Implement save-before-switch / unsaved-change confirmation and retry-safe offline recovery in a follow-up |
| P1 UX | Unexpected network save failures do not automatically retry until another edit/connectivity event | Autosave error path sets an error state but no scheduled backoff | Add bounded retry/backoff with explicit recovery action and E2E |
| P1 persistence | A legacy project may already contain multiple internal working copies | No historical uniqueness constraint, pre-PR89 writes allowed race | Read-only SQL audit, isolate affected projects, reconcile against backup |
| P2 integrity | No project-level atomic uniqueness index prevents reserved-label duplicates inserted by privileged out-of-band database writes | Schema defines a non-unique `model_checkpoints_project_idx` | After historical data audit/reconciliation, add approved partial unique index migration |
| P2 commercial | Historical provider webhook semantics are unqualified | Hyperswitch handler is disabled in this release | Retain hard disabled flag; separate release and integration suite for paid launch |

## Verified positive controls in current source

- Better Auth protected routes and organization/project RBAC server functions.
- Free-evaluation billing and webhook fail closed; production payment acceptance intentionally disabled.
- Five starter engineering projects plus synthesis, codegen and export regression coverage.
- Source file shape/length/storage budget and model-set import verification; authenticated PostgreSQL CI journeys.
- Guarded exact-main deployment, live qualification and independent operations approval workflows.

Do **not** say "fully production ready" solely on CI status. A production
release requires documented live deployment + cloud SQL recovery + business
scope + independent on-call/rollback sign-offs followed by the guarded
same-commit release publication.
