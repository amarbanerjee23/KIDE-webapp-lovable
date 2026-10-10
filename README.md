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

## v1.0.0 evaluation scope

KIDE v1.0.0 is a **free engineering evaluation**. Checkout, paid upgrades and
payment webhooks are deliberately disabled regardless of payment-provider
configuration. The product does not currently enforce advertised plan quotas
or offer enterprise SSO/SAML. Production paid subscriptions require additional
entitlement, lifecycle and payment-provider acceptance before enablement.

## Production

Required runtime variables:

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET` (minimum 32 characters)
- `BETTER_AUTH_TRUSTED_ORIGINS` when the same deployment is reachable through additional approved origins

The supplied `cloudbuild.yaml` discovers the deployed Cloud Run URL for `BETTER_AUTH_URL` and
configures the approved Cloud Run aliases in `BETTER_AUTH_TRUSTED_ORIGINS`. Origins are exact
HTTP(S) origins; the application does not disable Better Auth's CSRF or origin validation.
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
`kide` database and dedicated `kide_app` user when needed, generates a Cloud-SQL-compliant
database password, URL-encodes it for `DATABASE_URL`, stores the connection credential only in
Secret Manager, generates/reuses the Better Auth signing secret, and grants the Cloud Run runtime
identity both Secret Manager access and `roles/cloudsql.client`.

If an operator wants a fixed database password, store it in Secret Manager as
`kide-database-password`. Cloud Build reads that secret only during bootstrap and never commits or
prints its value. The password must contain lowercase, uppercase, a number and a non-alphanumeric
character. If the secret is absent, the bootstrap generates a compliant random password instead.

The Cloud Build service account therefore needs permission to administer this existing Cloud SQL
instance and the two KIDE Secret Manager secrets, plus permission to update the project IAM policy
for the runtime `roles/cloudsql.client` grant. The bootstrap step fails before image build if those
permissions are missing; it never falls back to a partially configured production deployment.

After bootstrap, the same Cloud Build attaches the instance with Cloud Run's managed Cloud SQL
integration and supplies:

```text
DATABASE_URL          <- Secret Manager: kide-database-url
BETTER_AUTH_SECRET    <- Secret Manager: kide-better-auth-secret
BETTER_AUTH_URL             <- deployed Cloud Run service URL
BETTER_AUTH_TRUSTED_ORIGINS <- deployed service URL + project-number Cloud Run URL
INSTANCE_UNIX_SOCKET        <- /cloudsql/project-b2a69875-a9ec-40fe-b15:us-central1:kide-web-app
```

The application never needs the Cloud SQL public IP. The build succeeds only after
`/api/auth/health` confirms PostgreSQL connectivity through both Better Auth's `pg` pool and
KIDE's `postgres.js` application client, plus successful Better Auth schema initialization.

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

## Production launch acceptance

To deploy a release candidate, use **Deploy production from approved main** in GitHub
Actions on the exact post-merge `main` commit. Supply `expected_commit_sha`
and `DEPLOY <full-SHA>` confirmation. The protected `production` workflow verifies
successful main CI, submits the canonical Cloud Build with the explicit commit
substitution, and validates the deployed Cloud Run revision against Artifact Registry.

After the deployment workflow passes, complete the database restore drill, then
run **Production deployment qualification** on that same `main` SHA. Publication
requires its successful run ID and cannot be triggered by CI alone.

For independent read-only checks, run GCP preflight and live smoke against
the deployed origin:

```sh
PROJECT_ID=your-project-id bash deploy/gcp/launch-preflight.sh
KIDE_URL=https://your-production-origin bash scripts/launch/live-smoke.sh
```

The launch preflight requires Cloud SQL automated backups and point-in-time recovery, active
production secrets, a healthy Better Auth/PostgreSQL runtime, and correct production auth URL
configuration. The live smoke creates a disposable test account, verifies session persistence and
checks anonymous protected-route fail-closed behavior.

Operational procedures live in:

- `docs/operations/launch-runbook.md`
- `docs/operations/database-backup-restore.md`
- `docs/operations/observability.md`

## Final launch acceptance evidence

For an official release candidate, capture machine-readable acceptance evidence from the exact green
commit after the restore drill has been completed:

```sh
PROJECT_ID=your-project-id \
KIDE_URL=https://your-production-origin \
OPERATOR=your-name-or-team \
RESTORE_DRILL_REF=your-restore-drill-record \
RELEASE_VERSION=1.0.0 \
bash scripts/launch/capture-acceptance.sh
```

The collector runs the GCP launch preflight, repeatable auth/session smoke, exact Cloud Run
revision and Artifact Registry image-digest verification, and a real Chromium customer engineering
journey ending in generated-code and release-bundle integrity verification. Acceptance evidence
includes all checks. Install `bun install --frozen-lockfile` and
`bunx playwright install --with-deps chromium` for operator-run acceptance.
Runtime evidence is ignored by Git and retained with release operations.
See `docs/operations/launch-acceptance.md`.

## Official release publication

Official release publication is manual and guarded. Run `Production deployment qualification`
from the exact green, deployed `main` commit, then provide its successful numeric run ID to the
`Publish official release` workflow. Do not paste launch acceptance JSON.

The workflow verifies:

- successful production qualification run and downloaded commit-scoped acceptance artifact;
- required real customer browser journey and matching Artifact Registry/Cloud Run digest;
- acceptance evidence structure and release version;
- acceptance commit equals current `main`;
- a successful `main` CI run exists for that exact SHA;
- the release tag and GitHub Release do not already exist;
- explicit confirmation `PUBLISH v1.0.0`.

It then creates the `v1.0.0` GitHub Release targeting the accepted commit and records the launch
acceptance evidence SHA-256 in the release notes. See
`docs/operations/release-publication.md`.

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
