# KIDE LSP transport

This service establishes the browser-facing Language Server Protocol boundary for KIDE.

## Endpoints

- `GET :8080/healthz` — process health
- `GET :8080/readyz` — ready only after the WebSocket server starts
- `WS :8081/lsp/kide` — JSON-RPC 2.0 / LSP transport

The service uses full-document synchronization in this phase. It deliberately keeps the
transport and deployment contract separate from the generated Eclipse Xtext language
services, which are integrated in the next phase.

## Supported language IDs

- `kide-dml` (`.dml`)
- `kide-op` (`.op`)
- `kide-mnc` (`.mncspec`)
- `kide-cap` (`.cap`)
- `kide-activity` (`.activity`)

The current diagnostics are transport-level syntax sanity checks only: registered file
type, expected top-level declaration, and balanced delimiters. The existing browser
parser remains authoritative until the Xtext engine cutover.

## Security

Browser origins are denied unless explicitly present in
`KIDE_LSP_ALLOWED_ORIGINS` (comma-separated). A literal `*` is supported only when
an operator intentionally chooses unrestricted origin access. Clients without an Origin
header are supported for CLI/health integration tests.

Messages larger than `KIDE_LSP_MAX_MESSAGE_BYTES` (default 1 MiB) are closed with
WebSocket code 1009.
