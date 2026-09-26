# PR29 — Auth runtime operationalization

## Objective
Make Better Auth operational readiness a deployment contract, not just an environment-variable
check.

## Scope
- verify PostgreSQL/Better Auth schema reachability before enabling sign-in;
- expose a safe public auth health probe for deployment verification;
- automatically create the Better Auth signing secret in GCP Secret Manager when absent;
- make production Cloud Build fail fast when the persistent PostgreSQL secret is absent;
- keep an explicit opt-out substitution for public/demo deployments;
- verify the live Cloud Run revision after deployment;
- add browser coverage for configured-but-unreachable PostgreSQL;
- never expose credentials or provider secret values.

## Roadmap impact
Knowledge Fabric follow-ons move forward:
- PR30 — global device knowledge ingestion and provenance
- PR31 — horizontally scalable hybrid semantic search
- PR32 — Knowledge Explorer / solution-creation UX and project binding
