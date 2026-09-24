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

docker run -d --name "$name"   -e POSTGRES_DB=kide   -e POSTGRES_USER=kide   -e POSTGRES_PASSWORD=kide-ci-password   postgres:17-alpine >/dev/null

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
  cat db/kide-application-schema.sql | docker exec -i "$name"     psql -v ON_ERROR_STOP=1 -U kide -d kide -f -
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

required_indexes=(
  projects_organization_idx model_versions_project_idx audit_events_scope_idx
  invitations_org_idx invitations_email_idx model_checkpoints_project_idx
  review_requests_project_idx review_comments_review_idx notifications_user_idx
)

for index in "${required_indexes[@]}"; do
  exists="$(docker exec "$name" psql -At -U kide -d kide -c "select to_regclass('public.${index}') is not null;")"
  [[ "$exists" == "t" ]] || { echo "Missing index: $index" >&2; exit 1; }
done

psql() {
  docker exec "$name" psql -v ON_ERROR_STOP=1 -At -U kide -d kide "$@"
}

expect_sql_failure() {
  local sql="$1"
  if psql -c "$sql" >/dev/null 2>&1; then
    echo "Expected SQL constraint failure, but statement succeeded: $sql" >&2
    exit 1
  fi
}

user_id="11111111-1111-4111-8111-111111111111"
org_id="$(psql -c "
  insert into public.organizations(name, slug, created_by)
  values ('CI Organization', 'ci-organization', '$user_id'::uuid)
  returning id;
" | head -1)"

psql -c "
  insert into public.organization_roles(organization_id, user_id, role)
  values ('$org_id'::uuid, '$user_id'::uuid, 'owner');
" >/dev/null

project_id="$(psql -c "
  insert into public.projects(organization_id, name, created_by)
  values ('$org_id'::uuid, 'CI Controller', '$user_id'::uuid)
  returning id;
" | head -1)"

expect_sql_failure "
  insert into public.organization_roles(organization_id, user_id, role)
  values ('$org_id'::uuid, '$user_id'::uuid, 'viewer');
"

expect_sql_failure "
  insert into public.projects(organization_id, name, current_stage, created_by)
  values ('$org_id'::uuid, 'Invalid Stage', 8, '$user_id'::uuid);
"

expect_sql_failure "
  insert into public.organizations(name, slug, created_by)
  values ('Bad Slug', 'Not Valid', '$user_id'::uuid);
"

expect_sql_failure "
  insert into public.model_versions(
    project_id, version, model_kind, content_hash, created_by
  )
  values (
    '$project_id'::uuid, 1, 'unknown-kind', 'deadbeef', '$user_id'::uuid
  );
"

psql -c "
  insert into public.invitations(
    organization_id, email, token, invited_by
  )
  values (
    '$org_id'::uuid, 'engineer@example.com', 'unique-ci-token', '$user_id'::uuid
  );
" >/dev/null

expect_sql_failure "
  insert into public.invitations(
    organization_id, email, token, invited_by
  )
  values (
    '$org_id'::uuid, 'other@example.com', 'unique-ci-token', '$user_id'::uuid
  );
"

psql -c "delete from public.organizations where id = '$org_id'::uuid;" >/dev/null

for table in organization_roles projects invitations; do
  remaining="$(psql -c "select count(*) from public.$table where organization_id = '$org_id'::uuid;")"
  [[ "$remaining" == "0" ]] || {
    echo "Cascade delete failed for $table" >&2
    exit 1
  }
done

echo "PostgreSQL schema is idempotent, indexed, constrained and cascade-safe."
