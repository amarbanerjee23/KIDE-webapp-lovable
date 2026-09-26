# PR28 — Auth readiness diagnostics

## Objective
Make production authentication failures actionable without exposing credentials.

## Scope
- return safe Better Auth readiness metadata;
- distinguish missing DATABASE_URL, missing BETTER_AUTH_URL, missing BETTER_AUTH_SECRET and a
  configured-but-too-short BETTER_AUTH_SECRET;
- render exact operator guidance on /auth;
- never return secret values, connection strings or secret lengths;
- preserve fail-closed production authentication;
- add unit and E2E coverage for each readiness state.

## Roadmap impact
The Knowledge Fabric follow-on PRs move forward by one slot:
- PR30 — global device knowledge ingestion and provenance
- PR31 — horizontally scalable hybrid semantic search
- PR32 — Knowledge Explorer / solution-creation UX and project binding
