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
The `/auth` page verifies both configuration and live PostgreSQL reachability before enabling the
form, without exposing connection strings, secret values, or secret lengths.

## Production

Required runtime variables:

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET` (minimum 32 characters)

The supplied `cloudbuild.yaml` discovers the deployed Cloud Run URL for `BETTER_AUTH_URL`.
Production authentication is required by default. Cloud Build automatically creates the Better Auth
signing secret when absent, requires the PostgreSQL Secret Manager value, deploys the revision and
then verifies `/api/auth/health`. A build stops rather than publishing a production revision
whose sign-in cannot reach PostgreSQL. Set `_REQUIRE_AUTH=false` only for an intentional public/demo
deployment.

### Hosted Google Cloud deployment

The current hosted KIDE deployment uses the existing Cloud SQL instance rather than its public IP:

```text
project: project-b2a69875-a9ec-40fe-b15
instance: kide-web-app
region: us-central1
connection: project-b2a69875-a9ec-40fe-b15:us-central1:kide-web-app
```

The hosted Cloud Build pipeline bootstraps this persistence layer automatically before building
the image. `_BOOTSTRAP_CLOUD_SQL` defaults to `true`. If `kide-database-url` does not already
have a version, the build validates the existing `kide-web-app` Cloud SQL instance, creates the
`kide` database and dedicated `kide_app` user when needed, generates a random database password,
stores the connection credential only in Secret Manager, generates/reuses the Better Auth signing
secret, and grants the Cloud Run runtime identity both Secret Manager access and
`roles/cloudsql.client`.

The Cloud Build service account therefore needs permission to administer this existing Cloud SQL
instance and the two KIDE Secret Manager secrets, plus permission to update the project IAM policy
for the runtime `roles/cloudsql.client` grant. The bootstrap step fails before image build if those
permissions are missing; it never falls back to a partially configured production deployment.

After bootstrap, the same Cloud Build attaches the instance with Cloud Run's managed Cloud SQL
integration and supplies:

```text
DATABASE_URL          <- Secret Manager: kide-database-url
BETTER_AUTH_SECRET    <- Secret Manager: kide-better-auth-secret
BETTER_AUTH_URL       <- deployed Cloud Run service URL
INSTANCE_UNIX_SOCKET  <- /cloudsql/project-b2a69875-a9ec-40fe-b15:us-central1:kide-web-app
```

The application never needs the Cloud SQL public IP. The build succeeds only after
`/api/auth/health` confirms PostgreSQL connectivity and successful Better Auth schema
initialization.

An external PostgreSQL server remains supported for self-hosted deployments. Set
`_BOOTSTRAP_CLOUD_SQL=false` and `_CLOUD_SQL_INSTANCE=` in that deployment's Cloud Build
substitutions, and provision `kide-database-url` out of band. The standalone bootstrap script
remains available for operators that do not want Cloud Build to manage persistence:

```sh
PROJECT_ID=your-project-id \
CLOUD_SQL_INSTANCE='' \
DATABASE_URL='postgres://user:password@host:5432/kide?sslmode=require' \
bash deploy/gcp/bootstrap-auth-secrets.sh
```

Cloud Build never creates a Cloud SQL instance; it only bootstraps the database/user/secrets inside
the configured existing instance and then attaches that instance to Cloud Run.
Local development can continue to use the included Docker Compose PostgreSQL service at no
software-license cost.

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
