# KIDE enterprise web application

KIDE is a browser-compute systems-engineering workbench built with TanStack Start, React and
TypeScript. KIDE domain computation stays in the browser; the Node runtime is an authenticated
I/O boundary.

## Authentication and persistence

KIDE is self-hostable and does not require Supabase.

- **Better Auth**: email/password sessions and optional Google OAuth.
- **PostgreSQL**: users, sessions and KIDE application persistence.
- **HTTP-only cookies**: browser sessions; no public service-role token is required.

### Local development

The quickest fully self-hosted path uses only open-source containers:

```sh
docker compose up --build
```

KIDE is then available at `http://localhost:8080` with PostgreSQL stored in a named Docker
volume. The compose credentials are development-only defaults and must not be reused for a
production deployment.

For a native development process, run PostgreSQL locally, then set:

```sh
export DATABASE_URL='postgres://kide:kide@127.0.0.1:5432/kide'
export BETTER_AUTH_URL='http://localhost:3000'
export BETTER_AUTH_SECRET='replace-with-at-least-32-random-characters'
bun install --frozen-lockfile
bun run dev
```

For Google sign-in, optionally add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Email/password
authentication works without a social provider.

In non-production development, KIDE supplies localhost defaults for the database URL, auth URL and
development-only auth secret. Production always fails closed unless explicit values are configured.

## Production

Required runtime variables:

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET` (minimum 32 characters)

The supplied `cloudbuild.yaml` discovers the deployed Cloud Run URL for `BETTER_AUTH_URL`.
It no longer fails a first deployment when authentication secrets have not been provisioned:
KIDE deploys with its public surface available and authentication explicitly unconfigured.

To enable authentication on GCP, point KIDE at any reachable PostgreSQL database and bootstrap the
two Secret Manager values:

```sh
PROJECT_ID=your-project-id \
DATABASE_URL='postgres://user:password@host:5432/kide?sslmode=require' \
bash deploy/gcp/bootstrap-auth-secrets.sh
```

The script creates/versions `kide-database-url` and `kide-better-auth-secret`, generates the
Better Auth secret when necessary, and grants the Cloud Run runtime service account Secret Manager
access. Re-run the Cloud Build trigger afterward.

A PostgreSQL server itself is not fabricated by Cloud Build. This is intentional: silently creating
a Cloud SQL instance could incur GCP charges. Local development can continue to use the included
Docker Compose PostgreSQL service at no software-license cost.

## Quality gates

```sh
bun install --frozen-lockfile
bunx eslint .
bunx tsc --noEmit
bunx vitest run
bun run build
docker build -t kide-webapp .
```

## Built with

- TanStack Start
- TypeScript / React
- Better Auth
- PostgreSQL
- Bun
- Tailwind CSS
