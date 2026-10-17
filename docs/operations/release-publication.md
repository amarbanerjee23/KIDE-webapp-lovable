# Official Release Publication

The official KIDE release is a manual, fail-closed sequence. The publication workflow
must **not** run from a pull request or automatically from a merge.

## Prerequisites

Before publication:

1. Merge all intended release changes into `main`.
2. Require successful post-merge `main` CI for that exact commit, including
   the production container and browser journey.
3. If the application is **already deployed**, dispatch **Attest existing production
   without deployment** on `main` with the full SHA and `ATTEST <same SHA>`.
   This protected, independently reviewed workflow reads existing Cloud Run,
   auth, Cloud SQL and Artifact Registry metadata without changing production;
   it fails unless the running revision matches that exact commit and image digest.
   If an actual deployment is needed and separately authorized, use **Deploy
   production from approved main** with `DEPLOY <same SHA>` instead.
   Both modes fail unless the running revision matches the exact main SHA.
4. Complete and document the Cloud SQL restore drill.
5. Configure the GitHub `production` environment with GCP workload identity,
   the production project, and required reviewer approvals.
6. Grant the qualification service account read access to Cloud Run, Cloud SQL,
   Secret Manager metadata and Artifact Registry image metadata.
7. Confirm monitoring/alert owners, privacy/terms approval, and no active
   release-blocking incident.
8. Configure the separate `production-release-approval` GitHub environment with
   **required reviewers** and disable self-review; a workflow with no human review
   cannot be accepted for publication.

## Qualify production

In GitHub Actions select **Production deployment qualification**, choose `main`,
and enter the successful Cloud SQL clone operation ID **and** its distinct
recovery instance name. An arbitrary issue/ticket reference is no longer valid.
First complete an operator-reviewed, read-only SQL recovery inspection.

This workflow:

- refuses stale commits or non-`main` references;
- verifies a real completed Cloud SQL clone operation plus a separate,
  runnable PostgreSQL recovery instance and listed application database;
- proves Cloud Run auth persistence and 100% traffic on the latest ready revision;
- matches the deployed image digest to the commit-tagged image in Artifact Registry;
- executes the live auth/session/anonymous-route smoke with a unique identity;
- runs the real Chromium engineering journey: signup, first **and second**
  project creation in an existing organization, one-click example project creation,
  model-file persistence after reload, blank-project isolation, synthesis,
  approval, generated-code download, release-bundle verification and sign-out;
- uploads a commit-scoped acceptance artifact containing schema-v2 evidence.

Retain the **successful GitHub Actions run ID**. Do not copy/paste acceptance JSON
into the publication workflow. Repeated qualification uses new disposable smoke and
engineering accounts with randomized names and addresses.

## Independently review production readiness

Once production qualification succeeds, dispatch **Production operations release approval**
from the **same current main SHA**, using the qualification run ID and private HTTPS
references to each approved evidence record: (1) actual read-only recovered SQL
tables and a known project; (2) Cloud SQL Audit Logs clone-source verification;
(3) alert delivery/on-call ownership and rollback exercise; (4) approved Privacy,
Terms and truthful free-evaluation copy; (5) unresolved critical/high incident
review. Record the exact confirmation `APPROVE v1.0.0 <40-character-main-SHA>`.

The workflow requires the independent `production-release-approval` environment
and records the attesting GitHub identity and references in a 90-day run artifact.
Publication **independently checks GitHub's approval history**, requiring an
approving reviewer different from the workflow actor. A bare GitHub environment
name without a real reviewer decision is insufficient. The operator remains
responsible for the substance and correctness of the linked evidence: checking
links and approvals cannot inspect private third-party records or replace
professional/legal sign-off. Do not put passwords, user data or secret query
parameters in the evidence URLs.

## Publish

In GitHub Actions select **Publish official release**, choose `main` and enter:

- Choose exactly **one** provenance input:
  `deployment_run_id` for a successful protected **Deploy production from approved main**
  run, **or** `existing_deployment_attestation_run_id` for a successful
  **Attest existing production without deployment** run from the same exact current
  main SHA. Leave the other input empty. The existing-production path requires a
  **real non-self GitHub production environment approval** and a hash-matched,
  read-only GCP snapshot that agrees with the separate live qualification;
- `qualification_run_id`: the numeric ID of a **successful Production deployment
  qualification** run for the current `main` SHA;
- `operations_approval_run_id`: successful, **independently reviewed**
  operations sign-off workflow for the same main SHA and qualification run;
- `confirmation`: exactly `PUBLISH v1.0.0`.

The workflow downloads the matching release acceptance artifact itself. It retains
all acceptance sidecar files and rejects missing or tampered preflight, smoke,
browser or deployment logs, a mismatched standalone deployment JSON,
failed/stale/non-`main` runs, mismatched commit or image evidence,
missing successful main CI, missing protected deployment proof, missing or unreviewed
operations sign-off, stale main, and an existing release or tag. On
success it creates `v1.0.0` pointing to the accepted commit and records the SHA-256
of its acceptance JSON in the release notes.

## No-redeploy limitations

The existing production attestation does **not** make an older running service
equivalent to the current repository. If the running image lacks the full
current-main SHA tag, immutable registry digest, trusted Cloud SQL/auth setup
or matching 100% ready-revision traffic, the attestation fails. Do not forge
provenance, rewrite registry tags, lower the SHA requirement or skip live E2E
to force publication. Either qualify an already matching service or make a
separately approved deployment plan.

GitHub's production environment must have actual required reviewers and
prevent self-review. The Google Cloud workload-identity provider must be
valid even though only read operations occur. Configuring a GitHub environment
variable alone does not authenticate the workflow.

## Retention and cleanup

Production qualification creates real Better Auth users, organizations and
projects. Accounts prefixed `launch-smoke-` and `kide-qualification-` are
operational test records, not customer accounts. Avoid running qualification
needlessly. Preserve them until the release evidence retention period has passed
and the operations owner has approved cleanup. Any cleanup must respect the
database's referential integrity and audit-retention policies; never run blanket
production deletions automatically.

The acceptance JSON and all verification logs are retained with operational
release records. Do not commit logs or publish credentials or test account
passwords. Browser traces and screenshots are not uploaded as public release
artifacts.

## Failure and rollback

A failed qualification creates **no release**. Diagnose and redeploy a
corrected `main` commit, then run qualification again; its run ID and artifact
must match the new commit. Never override release evidence or force-move a
published tag. For a Cloud Run incident follow
`docs/operations/launch-runbook.md`.

## PR82 — Protected deployment provenance and main race prevention

GitHub publication requires the original successful **Deploy production from
approved main** run ID, not merely a live Cloud Run deployment tagged with
the same commit SHA. The publication job retrieves that run and its
`verified-production-deploy-<sha>` artifact and requires all of the following:

- dispatch from `main`, exact current commit, successful protected deployment
  workflow identity and first attempt;
- original Cloud Run/Artifact Registry revision, image SHA-256, auth state,
  100% traffic, Cloud SQL attachment, service URL and commit tag;
- identity with the **independently captured live qualification evidence**
  from the protected production acceptance run.

This prevents release publication when production was deployed through another
workflow or when live revision/image/runtime identity drifted after the guarded
deployment. The original deployment artifact's SHA-256 and workflow run ID are
preserved in the official release notes.

Immediately before `gh release create`, publication fetches remote `main`
again, requires that it still matches both the workflow-dispatched SHA and
the checked-out SHA, and rechecks tag/release nonexistence. If `main` advanced,
restart the **entire** exact-commit deployment, live qualification and sign-off
sequence. The remote comparison narrows the race window; only repository tag
permissions and branch protection can prevent unrelated concurrent writes.

## PR92 — Protected recovery workflow must precede live acceptance

Protected production deployment remains the first operational step after
successful **post-merge main CI**. After rollout, run
`production-recovery-drill.yml` under the independently reviewed
`production-recovery` environment, selecting a **new** isolated recovery
instance and a bounded PITR timestamp. The clone remains RUNNABLE and is
never routed to by production.

Production deployment qualification now requires **three** exact-SHA inputs:
`recovery_run_id`, `restore_drill_reference` (completed CLONE operation ID)
and `restore_recovery_instance`. It downloads and verifies the protected
recovery run plus the original hashed metadata sidecar before executing live
qualification. Read-only recovered SQL row inspection and Cloud Audit Log source
verification remain required independent references in the separate operations
approval; they cannot be fabricated by a successful clone alone.

See [the four-stage execution runbook](protected-release-execution.md).
