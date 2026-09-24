# PR24 — Replace Supabase with Better Auth + PostgreSQL

Status: implementation in progress.

## Objective
Remove KIDE's runtime dependency on Supabase for authentication and application data access.

## Target architecture
- Better Auth for email/password sessions and future OIDC/social providers.
- PostgreSQL as the canonical server-side persistence store.
- Drizzle/postgres for server-side application data access.
- HTTP-only cookie sessions; no browser-visible service-role or bearer token plumbing.
- Existing organization/project role checks remain fail closed.
- Existing browser-side KIDE computation remains unchanged.

## Required runtime configuration
- DATABASE_URL
- BETTER_AUTH_SECRET
- BETTER_AUTH_URL

No SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY,
VITE_SUPABASE_URL or VITE_SUPABASE_* variable is required after this PR.

## Merge gate
- sign-up/sign-in/sign-out and session recovery work;
- protected routes fail closed without a valid session;
- project/organization authorization remains enforced server-side;
- all server-side data operations use PostgreSQL directly;
- no @supabase/supabase-js runtime dependency remains;
- migration schema is versioned;
- typecheck, tests, lint and production build pass.
