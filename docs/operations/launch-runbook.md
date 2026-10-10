# KIDE Production Launch Runbook

This runbook is the operator checklist for an official KIDE launch.

## Go/no-go prerequisites

All of the following must be true before public launch:

- `main` CI is green.
- the intended production commit is identified and immutable;
- `deploy/gcp/launch-preflight.sh` passes;
- `scripts/launch/live-smoke.sh` passes against the deployed origin;
- Cloud SQL automated backups and point-in-time recovery are enabled;
- a database restore drill has been completed and recorded;
- Better Auth health reports `operational: true`;
- the production Cloud Run revision uses the expected service account;
- required secrets have active versions in Secret Manager;
- public Privacy and Terms copy has been reviewed by the responsible legal/business owner;
- production monitoring and alert recipients have been configured;
- graph-assisted synthesis remains disabled unless its production owner explicitly enables it.

## Deploy — guarded exact-main Cloud Build rollout

Do not deploy directly from a local feature branch or a pull-request checkout.

1. Merge the approved release candidate and confirm the new `main` SHA has a
   successful **push-event CI** run.
2. In GitHub Actions, choose **Deploy production from approved main**, select
   the `main` branch, and provide:
   - `expected_commit_sha`: that exact **40-character lowercase main SHA**;
   - `confirmation`: exactly `DEPLOY <the-same-40-character-SHA>`.
3. The workflow enforces the GitHub `production` environment, verifies
   current main and its successful post-merge CI, and authenticates to GCP via
   short-lived Workload Identity Federation credentials.
4. It submits the canonical `cloudbuild.yaml` from the exact checkout, with
   an explicit `COMMIT_SHA` substitution, `_REQUIRE_AUTH=true`, and
   `_BOOTSTRAP_CLOUD_SQL=true`. It does **not** deploy an arbitrary image,
   downgrade authentication, or allow overriding the Git SHA.
5. After the build completes, the workflow verifies Cloud Run authentication,
   the expected commit, the Cloud SQL attachment, 100% ready-revision traffic,
   and matching immutable Cloud Run/Artifact Registry image digests. It retains
   a commit-specific deployment evidence artifact for 90 days.

The GitHub `production` environment must provide `GCP_PROJECT_ID`,
`GCP_WORKLOAD_IDENTITY_PROVIDER`, and `GCP_PRODUCTION_SERVICE_ACCOUNT`.
Optional configuration is `GCP_REGION` (default `us-central1`),
`GCP_SERVICE_NAME` (default `kide-webapp`),
`GCP_ARTIFACT_REPOSITORY` (default `kide`), and
`GCP_CLOUD_SQL_INSTANCE` (default `kide-web-app`).

The identity must have permission to submit and inspect Cloud Build builds and
stage build source, as well as the service-specific Cloud SQL/Secret Manager/IAM
permissions already described in the deployment bootstrap documentation.
Configure protected-environment reviewers and least-privilege access before use.

After the deployment workflow succeeds, perform the restore drill and launch
sign-offs, then dispatch **Production deployment qualification** for the same
`main` SHA. Use its successful numeric run ID with the guarded **Publish
official release** workflow. The deploy workflow deliberately does not publish
a release.

Record the approved commit, deployment workflow run, Cloud Build run,
Cloud Run revision/digest, release-qualification run, operator and time.

## Rollback

If the application is unhealthy after deployment:

1. stop further rollout or traffic changes;
2. route Cloud Run traffic back to the last known-good revision;
3. rerun `/api/auth/health`;
4. rerun the live smoke test;
5. preserve logs and the failed revision for investigation.

Do not roll the database backwards merely to match application code. Use a forward-compatible application rollback whenever possible.

## Graph synthesis emergency rollback

Graph-assisted production promotion has a runtime kill switch:

```text
KIDE_GRAPH_SYNTHESIS_KILL_SWITCH=1
```

The kill switch overrides production enablement. Synthesis falls back to the deterministic project-only path and graph-assisted approvals become stale until reviewed again.

## Authentication incident

If sign-in is unavailable:

1. check `/api/auth/health`;
2. verify Cloud SQL is reachable;
3. verify `kide-database-url:latest` and `kide-better-auth-secret:latest`;
4. verify the Cloud Run service account has Secret Manager access and `roles/cloudsql.client`;
5. verify `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS`;
6. do not bypass CSRF or trusted-origin checks as an incident workaround.

## Database incident

Follow `docs/operations/database-backup-restore.md`. Prefer point-in-time recovery into a separate recovery instance before any destructive action on production.

## Evidence retention

For every launch or emergency rollback retain:

- Cloud Build run;
- Cloud Run revision identifiers;
- launch preflight output;
- live smoke output;
- relevant Cloud Logging entries;
- database recovery evidence when applicable.
