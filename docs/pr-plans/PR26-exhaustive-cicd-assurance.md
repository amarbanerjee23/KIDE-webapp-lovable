# PR26 — Exhaustive CI/CD assurance

## Objective

Turn CI into a layered release gate rather than a single unit-test/build job.

## Mandatory layers

1. full repository lint and strict TypeScript;
2. full Vitest unit/domain suite plus critical-library coverage thresholds;
3. authentication/session and redirect boundary tests;
4. workspace file/storage/concurrency boundary and adversarial-input tests;
5. deterministic DSL/synthesis/qualification/release regression suite;
6. PostgreSQL schema idempotency and required-table contract;
7. production Docker image build and runtime health smoke;
8. browser E2E against the production container with real Better Auth + PostgreSQL;
9. unauthenticated direct-route rejection for every protected engineering route;
10. authenticated sign-up, organization creation, project creation, project opening and sign-out flow;
11. GCP Cloud Build/Secret Manager deployment-contract validation;
12. Compose and shell-script syntax/config validation;
13. hosted-BaaS/secret regression gates.

No automated suite proves software is literally defect-free. PR26 makes the defined critical
contracts mandatory and fail-closed on every PR and main-branch push.
