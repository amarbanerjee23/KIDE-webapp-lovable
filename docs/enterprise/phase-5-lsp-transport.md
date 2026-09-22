# Phase 5 — browser-facing LSP transport

This phase creates the stable runtime boundary that Monaco will use for enterprise language
services. The protocol transport is intentionally separated from the generated Eclipse Xtext
engine so WebSocket, Kubernetes, origin policy, health/readiness, and JSON-RPC behavior can be
qualified independently.

## Runtime contract

- Java 21 service
- WebSocket endpoint: `/lsp/kide`
- health endpoint: `/healthz`
- readiness endpoint: `/readyz`
- JSON-RPC 2.0 framing over WebSocket text messages
- full-document LSP synchronization
- completion and hover capabilities advertised during `initialize`
- deterministic publishDiagnostics notifications
- 1 MiB default message limit
- explicit browser-origin allowlist
- non-root, read-only-root-filesystem Kubernetes execution

## Language IDs

The transport keeps the IDs already used by the KIDE Monaco integration:

- `kide-dml`
- `kide-op`
- `kide-mnc`
- `kide-cap`
- `kide-activity`

The next phase binds generated Xtext 2.44 language services to this transport. Until then,
the existing browser parser remains authoritative for full DSL semantics; this service performs
only transport-level syntax sanity checks.

## Security boundary

Browser origins are denied unless explicitly allowed with
`KIDE_LSP_ALLOWED_ORIGINS`. Operators may use `*` only when unrestricted origin access is
intentional. Oversized WebSocket messages are rejected with code 1009.

The service is internal by default in the Helm chart. Public ingress and authentication are
added with the Monaco/Xtext cutover so an unauthenticated raw language-server socket is never
accidentally exposed.
