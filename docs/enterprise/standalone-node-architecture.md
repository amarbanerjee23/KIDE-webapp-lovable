# KIDE standalone Node.js + TypeScript architecture

This document supersedes the earlier multi-runtime Phase 1–3 architecture and the closed Java
language-service PR.

## Decision

KIDE is one standalone full-stack web application:

- React + TanStack Start for the browser and server boundary
- Node.js 22 production runtime
- TypeScript end to end
- Bun for dependency installation, tests, and builds
- Monaco in the browser
- the existing TypeScript KIDE lexer, parsers, AST, linker, diagnostics, and synthesis engine
- Supabase/Postgres for durable application data and authentication
- one production container

There are no Java, Python, Celery, RabbitMQ, Jena/Fuseki, or application-level Kubernetes
microservices in the target runtime.

## Language intelligence

Monaco continues to use the TypeScript KIDE language implementation directly for interactive
editing latency. No second Xtext grammar or Java LSP is maintained.

For trust-sensitive actions, the current workspace source files are sent through a TanStack
server function. The Node server re-runs the same parser and linker, so server verification is
independent of browser state without duplicating the grammar.

## Synthesis

The deterministic TypeScript synthesis engine in `src/lib/kide/synthesis.ts` is the single
implementation. Browser review and Node server verification both execute this same engine over
the same serialized workspace.

A candidate can be approved only when:

1. local preflight is ready;
2. the generated candidate has no parser validation errors;
3. Node server verification completed;
4. the server produced the same candidate ID and exact generated control-model source.

This removes the previous Python/Celery synthesis service and its translation contract.

## Semantic model

The linked TypeScript workspace is the canonical in-process semantic model. Cross-file symbols
and references are built by `linkWorkspace`. Durable organization/project data remains in
Supabase/Postgres. A separate RDF/Jena runtime is not required for the standalone product.

If external RDF exchange is needed later, RDF should be an import/export format generated from
the TypeScript semantic model, not a second source of truth.

## Deployment

The existing Dockerfile builds the TanStack application with Bun and runs the generated server
bundle on Node.js 22. Cloud Run or any ordinary container platform can run the same image.

The application exposes one HTTP service. Internal application calls use TanStack server
functions, which provide type-safe same-origin RPC and keep server handlers out of the browser
bundle.

## CI

The release gate is one Node/TypeScript pipeline:

1. frozen Bun dependency install;
2. architecture guard rejecting Python/Java service runtimes;
3. changed-file ESLint/Prettier;
4. full strict TypeScript compilation;
5. full Vitest suite;
6. production TanStack build;
7. standalone Docker image build.

This keeps the product architecture and the qualification architecture aligned.
