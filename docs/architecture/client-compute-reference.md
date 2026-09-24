# KIDE client-compute architecture reference

**Status:** Mandatory architecture reference for all future KIDE changes.

## 1. Core rule

KIDE is a browser-compute application.

All domain computation MUST execute in the user's browser. The backend exists only for
authenticated data access and infrastructure communication.

### Browser responsibilities

The browser owns:

- KIDE lexing and parsing;
- AST construction;
- cross-file linking and symbol resolution;
- diagnostics and language intelligence;
- capability and activity graph construction;
- deterministic synthesis and candidate ranking;
- model validation;
- scenario execution;
- assurance and qualification calculations;
- release evidence generation;
- transformations, exports, hashes, and other deterministic engineering computation;
- visual-editor state and bidirectional source synchronization.

A browser action may persist its inputs/results after computation, but the backend MUST NOT
repeat or replace that computation.

### Backend responsibilities

The Node/TanStack backend is an I/O boundary only. It MAY:

- verify Better Auth sessions and server-side authorization before data access;
- query and mutate PostgreSQL;
- persist workspace source, checkpoints, approvals, reviews, audit records, and generated
  artifacts;
- access object/file storage;
- call infrastructure services that require server-held secrets;
- communicate with payment providers and receive webhooks;
- proxy/query external infrastructure when credentials must not reach the browser.

The backend MUST NOT parse KIDE models, build ASTs, run synthesis, score candidates, execute
scenarios, perform qualification/assurance calculations, or generate control models.

## 2. Runtime topology

```text
Browser
  React + Monaco + TypeScript KIDE engine
       |
       | signed cookie + authenticated data / infrastructure I/O only
       v
TanStack Start / Node.js
       |
       +--> Better Auth
       +--> PostgreSQL
       +--> object storage
       +--> payment / webhook / secret-backed infrastructure
```

KIDE has no hosted-BaaS runtime dependency. Better Auth and PostgreSQL are self-hostable
open-source components.

## 3. Source of truth

The TypeScript implementation under `src/lib/dsl` and `src/lib/kide` is the single
computational source of truth.

Do not introduce:

- server-side copies of KIDE parsers or synthesis;
- Java/Xtext language implementations;
- Python computation services;
- Celery/RabbitMQ workers;
- Jena/Fuseki as a second semantic source of truth;
- a second AST or cross-language translation model.

If RDF, graph, or external formats are needed, generate/query them as infrastructure data
without moving KIDE computation out of the browser.

## 4. Session architecture

Session lifecycle is centralized at the application root.

- Better Auth owns sign-up, sign-in, sign-out, OAuth callbacks, session cookies and session validation.
- Session credentials remain in secure HTTP cookies rather than browser-managed service tokens.
- KIDE does not broker authentication from the Lovable/editor preview frame.
- The root session coordinator performs initial reconciliation and re-checks on focus, visibility
  changes and explicit authentication changes.
- Session loss immediately clears authenticated query cache, active project state and browser
  workspace state, then removes protected routes from the address bar.
- Visiting `/auth` never auto-enters a protected route.
- Only a successful, validated sign-in or an OAuth callback initiated by KIDE may leave `/auth`
  for a protected destination.
- Direct Sign In / Start Engineering actions from `/` clear any stale remembered protected
  destination before opening `/auth`.
- Restored sessions never force the public home route `/` to navigate away.
- A safe same-origin destination may be remembered in tab-scoped `sessionStorage`.
- Every protected pathname is re-checked against the validated session on navigation.
- Protected route guards provide navigation defense-in-depth.
- Server data functions independently enforce authentication and organization/project role checks.
- Production authentication fails closed if `DATABASE_URL`, `BETTER_AUTH_URL` or a sufficiently
  strong `BETTER_AUTH_SECRET` is missing.

## 5. Landing/root behavior

`/` is the stable public landing page. It performs no domain computation and owns no competing
session logic.

- valid session on `/` -> remain on the public landing page;
- no session on `/` -> remain on the public landing page;
- no session on `/auth` -> remain on the sign-in page;
- no session on any protected client route -> perform a browser-level `window.location.replace("/")`;
- session becomes invalid at any time on a protected route -> redirect immediately to `/`.

Protected content is withheld while the initial browser session is being resolved.

## 6. Maintainability rules

1. Prefer browser modules and pure TypeScript functions for domain behavior.
2. Keep server functions thin: authenticate, authorize, validate I/O shape, query/mutate, return.
3. Keep a single implementation of each engineering algorithm.
4. Avoid background workers until there is an infrastructure-only requirement that cannot run in
   the browser.
5. Do not add a new runtime language to the product without an explicit architecture decision.
6. Every PR must preserve strict TypeScript, tests, production build, container build and the
   architecture CI guard.
7. Authentication and application persistence must remain portable across self-hosted PostgreSQL
   deployments; do not reintroduce hosted-BaaS-specific SDKs.

## 7. CI architecture guard

CI rejects:

- tracked Python/Java application runtime files;
- the removed Jena/Celery/Helm microservice architecture;
- `createServerFn` inside `src/lib/kide`;
- server function imports of KIDE computational modules;
- a Supabase integration directory or `@supabase/supabase-js` dependency.

This document and `AGENTS.md` are the reference for future implementation decisions.
