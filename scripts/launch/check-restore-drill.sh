#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "CLOUD SQL RESTORE DRILL METADATA FAILED: $*" >&2
  exit 1
}

PROJECT_ID="${PROJECT_ID:-}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-kide-web-app}"
RESTORE_DRILL_REF="${RESTORE_DRILL_REF:-}"
RESTORE_DRILL_RECOVERY_INSTANCE="${RESTORE_DRILL_RECOVERY_INSTANCE:-}"
RESTORE_DRILL_DATABASE_NAME="${RESTORE_DRILL_DATABASE_NAME:-kide}"
OUTPUT_FILE="${OUTPUT_FILE:-}"

[[ -n "$PROJECT_ID" && -n "$RESTORE_DRILL_REF" &&
   -n "$RESTORE_DRILL_RECOVERY_INSTANCE" && -n "$OUTPUT_FILE" ]] ||
  fail "project, clone operation, distinct recovery instance and output path are required"
[[ "$CLOUD_SQL_INSTANCE" != "$RESTORE_DRILL_RECOVERY_INSTANCE" ]] ||
  fail "never qualify the production instance as a recovery target"
[[ "$PROJECT_ID" =~ ^[a-z][a-z0-9:-]+$ ]] || fail "invalid project ID"
[[ "$RESTORE_DRILL_REF" =~ ^[a-zA-Z0-9_-]+$ ]] || fail "invalid clone operation ID"
[[ "$RESTORE_DRILL_RECOVERY_INSTANCE" =~ ^[a-z][a-z0-9-]+$ ]] ||
  fail "invalid recovery instance name"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

gcloud sql operations describe "$RESTORE_DRILL_REF" \
  --project="$PROJECT_ID" --format=json >"$tmp/operation.json" ||
  fail "cannot read the requested clone operation"
gcloud sql instances describe "$CLOUD_SQL_INSTANCE" \
  --project="$PROJECT_ID" --format=json >"$tmp/source.json" ||
  fail "cannot read the production Cloud SQL instance"
gcloud sql instances describe "$RESTORE_DRILL_RECOVERY_INSTANCE" \
  --project="$PROJECT_ID" --format=json >"$tmp/recovery.json" ||
  fail "cannot read the recovery Cloud SQL instance"
gcloud sql databases list --instance="$RESTORE_DRILL_RECOVERY_INSTANCE" \
  --project="$PROJECT_ID" --format=json >"$tmp/databases.json" ||
  fail "cannot list recovery databases"

node scripts/launch/verify-restore-operation.mjs \
  "$tmp/operation.json" "$tmp/source.json" "$tmp/recovery.json" "$tmp/databases.json" \
  "$PROJECT_ID" "$CLOUD_SQL_INSTANCE" "$RESTORE_DRILL_RECOVERY_INSTANCE" \
  "$RESTORE_DRILL_DATABASE_NAME" "$RESTORE_DRILL_REF" "$OUTPUT_FILE"
