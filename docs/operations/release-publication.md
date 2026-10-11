# Official Release Publication

The official KIDE release is a manual, fail-closed sequence. The publication workflow
must **not** run from a pull request or automatically from a merge.

## Prerequisites

Before publication:

1. Merge all intended release changes into `main`.
2. Require successful post-merge `main` CI for that exact commit, including
   the production container and browser journey.
3. Dispatch **Deploy production from approved main** on `main`, passing the full
   SHA and `DEPLOY <same-40-character-SHA>` confirmation. The protected workflow
   submits Cloud Build with the exact `COMMIT_SHA`, requires configured auth,
   and fails unless the running revision and registry digest match that SHA.
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

- `qualification_run_id`: the numeric ID of a **successful Production deployment
  qualification** run for the current `main` SHA;
- `operations_approval_run_id`: successful, **independently reviewed**
  operations sign-off workflow for the same main SHA and qualification run;
- `confirmation`: exactly `PUBLISH v1.0.0`.

The workflow downloads the matching release acceptance artifact itself. It retains
all acceptance sidecar files and rejects missing or tampered preflight, smoke,
browser or deployment logs, a mismatched standalone deployment JSON,
failed/stale/non-`main` runs, mismatched commit or image evidence,
missing successful main CI, missing or unreviewed operations sign-off, and an existing release or tag. On
success it creates `v1.0.0` pointing to the accepted commit and records the SHA-256
of its acceptance JSON in the release notes.

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
