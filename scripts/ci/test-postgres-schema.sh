#!/usr/bin/env bash
set -euo pipefail

name="kide-pr26-postgres"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$name" \
  -e POSTGRES_DB=kide \
  -e POSTGRES_USER=kide \
  -e POSTGRES_PASSWORD=kide-ci-password \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$name" pg_isready -U kide -d kide >/dev/null 2>&1; then break; fi
  sleep 1
done

docker exec "$name" pg_isready -U kide -d kide >/dev/null

for pass in 1 2; do
  echo "Applying application schema pass $pass"
  docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U kide -d kide < db/kide-application-schema.sql >/dev/null
done

required_tables=(
  profiles organizations organization_roles projects model_versions audit_events
  invitations model_checkpoints review_requests review_comments notifications
  subscriptions payments
)

for table in "${required_tables[@]}"; do
  exists="$(docker exec "$name" psql -At -U kide -d kide -c "select to_regclass('public.${table}') is not null;")"
  [[ "$exists" == "t" ]] || { echo "Missing table: $table" >&2; exit 1; }
done

echo "PostgreSQL application schema is idempotent and complete."
