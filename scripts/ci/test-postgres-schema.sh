#!/usr/bin/env bash
set -euo pipefail

name="kide-pr26-postgres"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
diagnostics() {
  echo "=== PostgreSQL diagnostics ===" >&2
  docker ps -a --filter "name=$name" >&2 || true
  docker logs "$name" >&2 || true
}
trap cleanup EXIT
trap diagnostics ERR
cleanup

docker run -d --name "$name" \
  -e POSTGRES_DB=kide \
  -e POSTGRES_USER=kide \
  -e POSTGRES_PASSWORD=kide-ci-password \
  postgres:17-alpine >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$name" psql -At -U kide -d kide -c "select 1" 2>/dev/null | grep -qx 1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == "1" ]] || { echo "PostgreSQL did not become ready" >&2; exit 1; }

for pass in 1 2; do
  echo "Applying application schema pass $pass"
  cat db/kide-application-schema.sql | docker exec -i "$name" \
    psql -v ON_ERROR_STOP=1 -U kide -d kide -f -
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
