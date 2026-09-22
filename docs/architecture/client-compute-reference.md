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

- verify authentication/authorization before data access;
- query and mutate Supabase/Postgres;
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
       | authenticated data / infrastructure I/O only
       v
TanStack Start / Node.js
       |
       +--> Supabase/Postgres
       +--> object storage
       +--> payment / webhook / secret-backed infrastructure
```

There is one web application and one Node runtime. No application microservice is required for
KIDE computation.

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

- Supabase persists and refreshes the browser session.
- The root session coordinator performs initial reconciliation.
- `SIGNED_OUT` or any session-loss event immediately clears authenticated query cache and routes
  to `/auth`.
- `SIGNED_IN` and restored initial sessions route `/` or `/auth` into the application.
- A safe same-origin destination may be remembered in tab-scoped `sessionStorage`.
- Protected route guards provide navigation defense-in-depth.
- Server data functions independently enforce authentication/authorization; client guards are
  never treated as a data-security boundary.
- Missing Supabase configuration routes to the stable auth/configuration screen without making
  placeholder network calls.

## 5. Landing/root behavior

`/` is a stable session entry screen. It performs no domain computation and owns no competing
session logic. The root session coordinator decides navigation:

- valid session -> `/projects` or the remembered safe internal destination;
- no session -> `/auth`;
- session becomes invalid at any time -> `/auth`.

This avoids duplicated redirect effects and redirect races.

## 6. Maintainability rules

1. Prefer browser modules and pure TypeScript functions for domain behavior.
2. Keep server functions thin: authenticate, authorize, validate I/O shape, query/mutate, return.
3. Keep a single implementation of each engineering algorithm.
4. Avoid background workers until there is an infrastructure-only requirement that cannot run in
   the browser.
5. Do not add a new runtime language to the product without an explicit architecture decision.
6. Every PR must preserve strict TypeScript, tests, production build, and the architecture CI
   guard.

## 7. CI architecture guard

CI rejects:

- tracked Python/Java application runtime files;
- the removed Jena/Celery/Helm microservice architecture;
- `createServerFn` inside `src/lib/kide`;
- server function imports of `src/lib/dsl` or KIDE computational modules.

This document and `AGENTS.md` are the reference for future implementation decisions.
