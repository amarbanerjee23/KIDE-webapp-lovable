# KIDE v1.0.0 — four protected production gates

The software workflows are ready for reviewed execution. A GitHub merge **does not**
run them, configure GCP, prove recovered database rows, approve legal documents
or constitute an independent human sign-off.

## Gate 0 — exact-main CI

Freeze `main` and verify its **own** successful push-event CI (all 18 jobs).
Each subsequent action rechecks this same main SHA. If another PR is merged,
restart the entire approval/restore/deployment process for the new SHA.

## Gate 1 — deploy verified production

Configure GitHub `production` environment required reviewers, prevent
self-review and protected GCP Workload Identity Federation secrets/variables.
Dispatch [Deploy production from approved main](../../.github/workflows/deploy-production.yml)
on `main` with `expected_commit_sha=<main SHA>` and
`confirmation=DEPLOY <main SHA>`. Verify 100% latest Cloud Run traffic,
Better Auth health, Cloud SQL attachment, image digest and retained
`verified-production-deploy-<SHA>` artifact. Record its workflow run ID.

**No feature-branch builds, production auth bypass, or stale-SHA deployments.**

## Gate 2 — perform real isolated Cloud SQL recovery

Configure **separate protected environment `production-recovery`** with
required independent reviewers (prevent self-review), the GCP project variable
and Workload Identity Federation credentials. The principal must have
`cloudsql.instances.clone`, Cloud SQL operation read, source/list read and
backup metadata permissions. Allocate sufficient quota, disk, and budget for
one **new** independent Cloud SQL instance; it remains billable until separately
approved cleanup.

Select a PITR timestamp within the currently retained WAL window and within
seven days of execution. Dispatch
[Protected Cloud SQL recovery drill](../../.github/workflows/production-recovery-drill.yml)
from `main` with:

- `expected_commit_sha`: exact 40-character current main SHA
- `recovery_instance`: **unused** `kide-recovery-<identifier>` instance ID,
  never `kide-web-app`
- `point_in_time`: approved UTC RFC3339 timestamp at least one minute old
- `confirmation`: `RESTORE <main SHA> TO <recovery instance ID>`

The protected job validates exact-main CI, source readiness, backup/PITR and
unused destination **before** issuing `gcloud sql instances clone --point-in-time`.
The clone is created with `--async`, waited for to complete, and verified by
existing Cloud SQL operation/instance/database metadata checks. Original
source instance and Cloud Run production traffic are not altered. The workflow
retains a checksum-linked `protected-recovery-<SHA>-<run ID>` artifact with
clone operation ID, target instance and time, explicitly marked **source audit
and recovered SQL content NOT YET VERIFIED**.

### Actual recovered SQL inspection — independent operator required

1. Confirm the recovery job's completed operation ID and separate instance,
   and independently inspect Cloud Audit Logs for the `cloudsql.instances.clone`
   request to prove **production** was the clone source.
2. Connect using the Cloud SQL Auth Proxy specifically to the
   **recovery instance's** connection name. Use a dedicated SELECT-only
   PostgreSQL role (not a production owner/admin and never a production
   connection string). If private IP is used, the reviewing operator must run
   the proxy from an approved VPC-connected runner.
3. Use `psql -X -v ON_ERROR_STOP=1 -v known_project_id='<pre-approved UUID>'
   -f scripts/launch/recovery-readonly-inspection.sql`. This starts a
   REPEATABLE READ, READ ONLY transaction and checks Better Auth and KIDE
   table presence, real user existence, the exact known project/org relation
   and absence of duplicate internal working copies. Confirm authentic
   session/account/verification table presence from its metadata report.
4. Retain signed output and SQL connection-target identity **privately**.
   It must have no emails, passwords, tokens, or model content. Flag any
   missing table/row, unexpected duplicate, timestamp or identity mismatch
   as a blocking incident. Do not delete data to force a pass.
5. Preserve clone RUNNABLE through live qualification and approval. Cleanup
   is a separately reviewed operation **after** evidence retention is secured;
   the workflow never automatically deletes instances.

A normal `CLONE` without PITR is not equivalent to the tested point-in-time
recovery. Standard Cloud SQL clone/PITR behavior is documented at:
https://cloud.google.com/sql/docs/postgres/backup-recovery/pitr .

## Gate 3 — live acceptance and evidence

Dispatch [Production deployment qualification](../../.github/workflows/production-qualification.yml)
from unchanged `main` with **three** inputs: `recovery_run_id`,
`restore_drill_reference` (successful CLONE operation ID), and
`restore_recovery_instance` (isolated instance). Qualification now **downloads
and validates** the successful, first-attempt, protected recovery run and
SHA-256 matching artifact; independently re-reads live Cloud SQL metadata,
validates deployed Cloud Run SHA/digest/traffic, executes auth smoke and real
Chromium signup, tenant isolation, five example codegen and release export,
and uploads checksummed acceptance evidence.

Preserve the successful qualification run ID and inspect logs/screenshots in
restricted operational storage. Never accept green synthetic unit CI as
proof of live KIDE acceptance.

## Gate 4 — independent release sign-off and publish

Configure the separate `production-release-approval` environment with
**required reviewers distinct from the run initiator**, and prevent self-review.
Dispatch [Production operations release approval](../../.github/workflows/operations-approval.yml)
with qualification run ID, five private HTTPS evidence URLs for (1) recovered
SQL rows, (2) clone-source Cloud Audit Logs, (3) on-call alert/rollback test,
(4) approved Terms/Privacy and **free-evaluation** claims, (5) reviewed
high/critical incident register; confirm `APPROVE v1.0.0 <SHA>`.

An operator/ChatGPT/CI bot **must not** self-attest or fabricate these
approvals. The existing publisher rechecks GitHub's independent protected
review event and run provenance, not just text in an artifact.

Finally dispatch [Publish official release](../../.github/workflows/publish-release.yml)
with successful deployment run ID, qualification run ID, operations approval
run ID and `confirmation=PUBLISH v1.0.0`. Verify the new `v1.0.0` tag
and post-publish smoke. Paid checkout remains disabled.

## Emergency stop / rollback

Stop on any unsuccessful push CI, stale main, non-independent review, failed
recovery, missing SQL/source proof, inconclusive live acceptance, auth failure,
digest drift or high/critical incident. Use the documented Cloud Run previous-
revision traffic rollback; never overwrite production SQL with the clone without
a separate disaster-recovery change approval.
