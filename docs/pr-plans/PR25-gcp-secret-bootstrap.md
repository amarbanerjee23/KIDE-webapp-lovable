# PR25 — GCP secret bootstrap and fail-safe Cloud Run deployment

## Problem
Cloud Build currently attaches Secret Manager references unconditionally. A new GCP project fails
at `gcloud run deploy` when `kide-database-url` or `kide-better-auth-secret` does not exist.

## Contract
- detect required Secret Manager secrets before deployment;
- never attach a missing secret/version to a Cloud Run revision;
- attempt to bootstrap the Better Auth secret when permissions allow;
- never invent a fake PostgreSQL connection string;
- deploy the public KIDE application in an explicit auth-unconfigured state when the database
  secret is absent;
- provide an operator bootstrap script for configuring the database/auth secrets;
- keep credentials out of source control and build logs.
