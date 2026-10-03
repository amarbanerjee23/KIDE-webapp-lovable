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

## Deploy

Deploy only from a green `main` commit through the existing Cloud Build pipeline.

After Cloud Build reports success:

```sh
PROJECT_ID=<project> bash deploy/gcp/launch-preflight.sh
KIDE_URL=https://<production-origin> bash scripts/launch/live-smoke.sh
```

Record:

- Git commit SHA;
- Cloud Run revision;
- deployment time;
- smoke-test run ID;
- operator.

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
